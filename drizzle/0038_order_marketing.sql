-- Whether the buyer wanted to hear about new things.
--
-- Kept on the order rather than acted on at checkout, because the exemption
-- this relies on — markedsføringsloven § 15 — is for an *existing customer*.
-- A payment that was abandoned or declined is not a sale, and adding someone to
-- a mailing list on the strength of one would be marketing to a stranger.
--
-- So the answer is recorded here when they give it, and only used if the money
-- actually arrives.
ALTER TABLE `orders` ADD `marketing_opt_in` integer DEFAULT false NOT NULL;
