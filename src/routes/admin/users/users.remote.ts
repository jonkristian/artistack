import * as v from 'valibot';
import { form, command } from '$app/server';
import { db } from '$lib/server/db';
import { user, account } from '$lib/server/auth-schema';
import { eq, ne, and } from 'drizzle-orm';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

// ============================================================================
// Validation Schemas
// ============================================================================

const addUserSchema = v.pipe(
	v.object({
		name: v.pipe(v.string(), v.nonEmpty('Name is required')),
		email: v.pipe(v.string(), v.email('Please enter a valid email')),
		password: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters')),
		confirmPassword: v.pipe(v.string(), v.nonEmpty('Please confirm the password')),
		role: v.optional(v.picklist(['admin', 'editor']))
	}),
	v.forward(
		v.partialCheck(
			[['password'], ['confirmPassword']],
			(input) => input.password === input.confirmPassword,
			'Passwords do not match'
		),
		['confirmPassword']
	)
);

const updateUserSchema = v.object({
	id: v.string(),
	name: v.optional(v.string()),
	email: v.optional(v.pipe(v.string(), v.email('Please enter a valid email'))),
	role: v.optional(v.picklist(['admin', 'editor']))
});

const updateOwnProfileSchema = v.object({
	userId: v.string(),
	name: v.pipe(v.string(), v.nonEmpty('Name is required')),
	email: v.pipe(v.string(), v.email('Please enter a valid email'))
});

const deleteUserSchema = v.object({
	id: v.string(),
	currentUserId: v.string()
});

const changePasswordSchema = v.pipe(
	v.object({
		userId: v.string(),
		currentPassword: v.pipe(v.string(), v.nonEmpty('Current password is required')),
		newPassword: v.pipe(v.string(), v.minLength(8, 'New password must be at least 8 characters')),
		confirmPassword: v.pipe(v.string(), v.nonEmpty('Please confirm your password'))
	}),
	v.forward(
		v.partialCheck(
			[['newPassword'], ['confirmPassword']],
			(input) => input.newPassword === input.confirmPassword,
			'Passwords do not match'
		),
		['confirmPassword']
	)
);

const resetPasswordSchema = v.pipe(
	v.object({
		userId: v.string(),
		adminId: v.string(),
		newPassword: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters')),
		confirmPassword: v.pipe(v.string(), v.nonEmpty('Please confirm the password'))
	}),
	v.forward(
		v.partialCheck(
			[['newPassword'], ['confirmPassword']],
			(input) => input.newPassword === input.confirmPassword,
			'Passwords do not match'
		),
		['confirmPassword']
	)
);

// ============================================================================
// User Management Commands
// ============================================================================

export const addUser = form(addUserSchema, async ({ name, email, password, role }) => {
	// Check if email already exists
	const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
	if (existing.length > 0) {
		throw new Error('A user with this email already exists');
	}

	// Generate user ID and hash password
	const userId = crypto.randomUUID();
	const hashedPassword = await hashPassword(password);

	// Create user directly in database (uses defaults for timestamps)
	const [newUser] = await db
		.insert(user)
		.values({
			id: userId,
			name,
			email,
			emailVerified: true,
			role: role || 'editor'
		})
		.returning();

	// Create credential account (must provide updatedAt as it has no default)
	await db.insert(account).values({
		id: crypto.randomUUID(),
		accountId: userId,
		providerId: 'credential',
		userId: userId,
		password: hashedPassword,
		updatedAt: new Date()
	});

	return { success: true, user: newUser };
});

export const updateUser = command(updateUserSchema, async ({ id, name, email, role }) => {
	const updateData: Record<string, unknown> = {};

	if (name !== undefined) updateData.name = name;
	if (email !== undefined) updateData.email = email;
	if (role !== undefined) updateData.role = role;

	if (Object.keys(updateData).length === 0) {
		throw new Error('No fields to update');
	}

	// Check if email is being changed and if it's already taken
	if (email) {
		const existing = await db
			.select()
			.from(user)
			.where(and(eq(user.email, email), ne(user.id, id)))
			.limit(1);
		if (existing.length > 0) {
			throw new Error('A user with this email already exists');
		}
	}

	const [updated] = await db.update(user).set(updateData).where(eq(user.id, id)).returning();

	if (!updated) {
		throw new Error('User not found');
	}

	return { success: true, user: updated };
});

export const updateOwnProfile = command(updateOwnProfileSchema, async ({ userId, name, email }) => {
	// Get current user's email to check if it's changing
	const [currentUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

	if (!currentUser) {
		throw new Error('User not found');
	}

	// Check if email is being changed and if it's already taken
	if (email !== currentUser.email) {
		const existing = await db
			.select()
			.from(user)
			.where(and(eq(user.email, email), ne(user.id, userId)))
			.limit(1);
		if (existing.length > 0) {
			throw new Error('A user with this email already exists');
		}
	}

	const [updated] = await db
		.update(user)
		.set({ name, email })
		.where(eq(user.id, userId))
		.returning();

	if (!updated) {
		throw new Error('Failed to update profile');
	}

	return { success: true, user: updated };
});

export const deleteUser = command(deleteUserSchema, async ({ id, currentUserId }) => {
	// Prevent deleting yourself
	if (id === currentUserId) {
		throw new Error('You cannot delete your own account');
	}

	// Check if the current user is an admin
	const [currentUser] = await db.select().from(user).where(eq(user.id, currentUserId)).limit(1);
	if (currentUser?.role !== 'admin') {
		throw new Error('Only admins can delete users');
	}

	// Delete user (sessions and accounts will cascade)
	const [deleted] = await db.delete(user).where(eq(user.id, id)).returning();

	if (!deleted) {
		throw new Error('User not found');
	}

	return { success: true };
});

export const changePassword = command(changePasswordSchema, async ({ userId, currentPassword, newPassword }) => {
	// Get the credential account for this user
	const [userAccount] = await db
		.select()
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
		.limit(1);

	if (!userAccount?.password) {
		throw new Error('No password set for this account');
	}

	// Verify current password
	const isValid = await verifyPassword({ hash: userAccount.password, password: currentPassword });
	if (!isValid) {
		throw new Error('Current password is incorrect');
	}

	// Hash and update new password
	const hashedPassword = await hashPassword(newPassword);
	await db
		.update(account)
		.set({ password: hashedPassword })
		.where(eq(account.id, userAccount.id));

	return { success: true };
});

export const resetPassword = command(resetPasswordSchema, async ({ userId, adminId, newPassword }) => {
	// Verify the requester is an admin
	const [admin] = await db.select().from(user).where(eq(user.id, adminId)).limit(1);
	if (admin?.role !== 'admin') {
		throw new Error('Only admins can reset passwords');
	}

	// Get the credential account for the target user
	const [userAccount] = await db
		.select()
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
		.limit(1);

	if (!userAccount) {
		throw new Error('User account not found');
	}

	// Hash and update new password
	const hashedPassword = await hashPassword(newPassword);
	await db
		.update(account)
		.set({ password: hashedPassword })
		.where(eq(account.id, userAccount.id));

	return { success: true };
});
