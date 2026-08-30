// Platform detection, icons, and colors utility
// Shared between client and server components

export type PlatformCategory = 'streaming' | 'social' | 'event' | 'other';

export interface PlatformInfo {
  platform: string;
  category: PlatformCategory;
}

/**
 * SVG path data for platform icons (24x24 viewBox)
 */
export const platformIcons: Record<string, string> = {
  // Streaming
  spotify:
    'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
  apple_music:
    'M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z',
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  youtube_music:
    'M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z',
  soundcloud:
    'M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z',
  bandcamp: 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z',
  deezer:
    'M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z',
  tidal:
    'M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996 4.004 12l4.004-4.004L12.012 12l-4.004 4.004 4.004 4.004 4.004-4.004L12.012 12l4.004-4.004-4.004-4.004zM16.042 7.996l3.979-3.979L24 7.996l-3.979 3.979z',
  amazon_music:
    'M17.28 2.4H6.72c-2.386 0-4.32 1.934-4.32 4.32v10.56c0 2.386 1.934 4.32 4.32 4.32h10.56c2.386 0 4.32-1.934 4.32-4.32V6.72C21.6 4.334 19.666 2.4 17.28 2.4zM18.331 10.202c0.312-0.134 0.682-0.152 0.994-0.058 0.13 0.04 0.245 0.094 0.355 0.161v0.59c-0.346-0.237-0.744-0.304-1.051-0.139-0.326 0.179-0.518 0.554-0.509 0.948-0.005 0.434 0.139 0.836 0.442 1.024 0.269 0.183 0.691 0.183 1.118 0.116v0.492c-0.168 0.054-0.346 0.085-0.528 0.103-0.302 0.023-0.638-0.023-0.936-0.183-0.302-0.156-0.523-0.429-0.648-0.703-0.12-0.282-0.163-0.568-0.168-0.841C17.386 11.132 17.698 10.479 18.331 10.202zM16.32 8.645c0.265 0 0.48 0.215 0.48 0.48s-0.215 0.48-0.48 0.48-0.48-0.215-0.48-0.48S16.055 8.645 16.32 8.645zM16.68 10.085v3.36h-0.72v-3.36H16.68zM12.96 12.564c0.307 0.125 0.682 0.255 0.974 0.283 0.293 0.033 0.614-0.005 0.802-0.107 0.091-0.056 0.11-0.133 0.11-0.22s-0.017-0.135-0.059-0.2c-0.076-0.118-0.287-0.207-0.617-0.286-0.163-0.047-0.341-0.093-0.538-0.2-0.197-0.088-0.597-0.409-0.519-0.956 0.042-0.292 0.345-0.578 0.769-0.712 0.494-0.156 1.032-0.079 1.478 0.135V10.896c-0.398-0.204-0.874-0.308-1.277-0.173-0.12 0.037-0.278 0.12-0.278 0.27 0 0.36 0.418 0.429 0.576 0.48 0.163 0.051 0.341 0.097 0.533 0.195 0.192 0.093 0.577 0.325 0.577 0.856 0 0.508-0.251 0.695-0.457 0.778-0.427 0.186-0.806 0.153-1.176 0.102-0.312-0.056-0.614-0.149-0.898-0.324C12.96 13.08 12.96 12.564 12.96 12.564zM9.72 10.086l0.72-0.001 0.001 1.161c0.007 0.379 0.006 0.792 0.002 1.144-0.017 0.188 0.193 0.407 0.468 0.44 0.147 0.016 0.256 0.004 0.426-0.067 0.1-0.039 0.202-0.073 0.303-0.108V10.085l0.72 0v3.273h-0.72v-0.113c-0.02 0.011-0.038 0.022-0.058 0.032-0.183 0.109-0.476 0.185-0.726 0.164-0.26-0.017-0.522-0.108-0.736-0.281-0.212-0.171-0.372-0.439-0.393-0.734-0.013-0.422-0.01-0.784-0.006-1.179L9.72 10.086zM4.44 10.085h0.72v0.33c0.178-0.064 0.354-0.132 0.532-0.192 0.257-0.091 0.579-0.073 0.832 0.067 0.105 0.056 0.196 0.135 0.277 0.225 0.27-0.1 0.539-0.2 0.811-0.293 0.257-0.091 0.579-0.073 0.832 0.068 0.255 0.137 0.454 0.388 0.524 0.68 0.019 0.073 0.027 0.147 0.032 0.222l0.001 0.152 0.003 0.3-0.003 0.6-0.001 1.2h-0.72l-0.003-2.325c-0.02-0.204-0.249-0.383-0.489-0.318-0.245 0.065-0.492 0.122-0.738 0.182 0.016 0.069 0.025 0.138 0.03 0.208l0.001 0.152 0.003 0.3-0.003 0.6-0.001 1.2h-0.72l-0.003-2.325c-0.02-0.204-0.249-0.383-0.489-0.317-0.235 0.062-0.472 0.118-0.708 0.175v2.467h-0.72C4.44 13.443 4.44 10.085 4.44 10.085zM18.609 16.287c-1.063 0.754-2.25 1.25-3.497 1.573-1.246 0.318-2.543 0.439-3.833 0.35-1.29-0.086-2.55-0.401-3.738-0.861-1.184-0.475-2.303-1.086-3.292-1.887-0.051-0.042-0.06-0.118-0.017-0.169 0.037-0.046 0.1-0.057 0.15-0.03l0.007 0.004c1.08 0.584 2.233 1.032 3.392 1.387 1.168 0.332 2.356 0.57 3.552 0.618 1.193 0.042 2.399-0.051 3.575-0.296 1.172-0.242 2.354-0.593 3.442-1.094l0.019-0.009c0.12-0.055 0.263-0.003 0.318 0.118C18.737 16.098 18.701 16.222 18.609 16.287zM19.143 17.708c-0.133 0.101-0.267 0.067-0.2-0.101 0.2-0.538 0.634-1.68 0.434-1.949-0.233-0.302-1.434-0.134-1.967-0.067-0.167 0-0.167-0.134-0.034-0.235 0.467-0.336 1.1-0.47 1.634-0.471 0.533 0 1 0.101 1.101 0.269C20.277 15.355 20.043 16.935 19.143 17.708z',

  // Social
  instagram:
    'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  twitter:
    'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  facebook:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',

  // Event platforms
  bandsintown:
    'M6.399 12.8v4.8H19.2v1.6H4.799V0H0v24h24V12.8H6.399Zm4.801-8H6.399v6.4H11.2V4.8Zm6.4 0h-4.8v6.4h4.8V4.8ZM24 0h-4.8v11.2H24V0Z',
  eventbrite:
    'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 17.08c-1.837 1.837-4.428 2.534-6.922 1.952l3.47-3.47c.39-.39.39-1.023 0-1.414-.39-.39-1.023-.39-1.414 0l-3.47 3.47c-.582-2.494.115-5.085 1.952-6.922 1.837-1.837 4.428-2.534 6.922-1.952l-3.47 3.47c-.39.39-.39 1.023 0 1.414.39.39 1.023.39 1.414 0l3.47-3.47c.582 2.494-.115 5.085-1.952 6.922z',
  songkick:
    'M6.55 18.779c-1.855 0-3.372-.339-4.598-1.602l1.92-1.908c.63.631 1.74.853 2.715.853 1.186 0 1.739-.391 1.739-1.089 0-.291-.06-.529-.239-.717-.15-.154-.404-.273-.795-.324l-1.455-.205c-1.064-.152-1.891-.51-2.43-1.072-.555-.578-.84-1.395-.84-2.434C2.536 8.066 4.2 6.45 6.96 6.45c1.74 0 3.048.407 4.086 1.448L9.171 9.77c-.765-.766-1.77-.715-2.295-.715-1.039 0-1.465.597-1.465 1.125 0 .152.051.375.24.561.15.153.404.307.832.359l1.467.203c1.09.153 1.875.495 2.385 1.005.645.63.9 1.53.9 2.655 0 2.47-2.127 3.819-4.68 3.819l-.005-.003zM20.813 2.651C19.178 1.432 17.37.612 15.089.237v10.875l3.261-4.539h3.565l-4.095 5.72s.944 1.51 1.515 2.405c.586.899 1.139 1.14 1.965 1.14h.57v2.806h-.872c-1.812 0-2.9-.33-3.72-1.575-.504-.811-2.175-3.436-2.175-3.436v4.995H12.12V-.001H12c-3.852 0-6.509.931-8.811 2.652C-.132 5.137.001 8.451.001 11.997c0 3.547-.133 6.867 3.188 9.352C5.491 23.074 8.148 24 12 24s6.51-.927 8.812-2.651C24.131 18.865 24 15.544 24 11.997c0-3.546.132-6.859-3.188-9.346h.001z',
  dice: 'M20.5 3h-17A1.5 1.5 0 002 4.5v15A1.5 1.5 0 003.5 21h17a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0020.5 3zM7 18a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0-6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 3a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 3a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0-6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
  seetickets:
    'M20 4H4c-1.1 0-2 .9-2 2v4c1.1 0 2 .9 2 2s-.9 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2V6c0-1.1-.9-2-2-2zm-2 6.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-1c0-.28.22-.5.5-.5h11c.28 0 .5.22.5.5v1zm0 4c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-1c0-.28.22-.5.5-.5h11c.28 0 .5.22.5.5v1z',

  // Code forges
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'
};

/**
 * Brand colors for platforms
 */
export const platformColors: Record<string, string> = {
  // Streaming
  spotify: '#1DB954',
  apple_music: '#FA243C',
  youtube: '#FF0000',
  youtube_music: '#FF0000',
  soundcloud: '#FF5500',
  bandcamp: '#629aa9',
  deezer: '#FEAA2D',
  tidal: '#000000',
  amazon_music: '#25D1DA',

  // Social
  instagram: '#E4405F',
  tiktok: '#000000',
  twitter: '#000000',
  facebook: '#1877F2',

  // Event platforms
  bandsintown: '#00CEC8',
  eventbrite: '#F05537',
  songkick: '#F80046',
  dice: '#121212',
  seetickets: '#E31837',

  // Code forges
  github: '#181717'
};

/**
 * URL patterns for platform detection
 */
const platformPatterns: Array<{ pattern: RegExp; platform: string; category: PlatformCategory }> = [
  // Streaming platforms
  { pattern: /open\.spotify\.com/i, platform: 'spotify', category: 'streaming' },
  { pattern: /music\.apple\.com/i, platform: 'apple_music', category: 'streaming' },
  { pattern: /music\.youtube\.com/i, platform: 'youtube_music', category: 'streaming' },
  { pattern: /soundcloud\.com/i, platform: 'soundcloud', category: 'streaming' },
  { pattern: /bandcamp\.com/i, platform: 'bandcamp', category: 'streaming' },
  { pattern: /deezer\.com/i, platform: 'deezer', category: 'streaming' },
  { pattern: /tidal\.com/i, platform: 'tidal', category: 'streaming' },

  // Social platforms
  { pattern: /instagram\.com/i, platform: 'instagram', category: 'social' },
  { pattern: /tiktok\.com/i, platform: 'tiktok', category: 'social' },
  { pattern: /(twitter\.com|x\.com)/i, platform: 'twitter', category: 'social' },
  { pattern: /facebook\.com(?!.*\/events)/i, platform: 'facebook', category: 'social' },
  { pattern: /(youtube\.com|youtu\.be)(?!.*music)/i, platform: 'youtube', category: 'social' },

  // Event platforms
  { pattern: /bandsintown\.com/i, platform: 'bandsintown', category: 'event' },
  { pattern: /eventbrite\.(com|co\.uk|de|fr|es)/i, platform: 'eventbrite', category: 'event' },
  { pattern: /songkick\.com/i, platform: 'songkick', category: 'event' },
  { pattern: /dice\.fm/i, platform: 'dice', category: 'event' },
  { pattern: /seetickets\.(com|us)/i, platform: 'seetickets', category: 'event' },
  { pattern: /facebook\.com\/events/i, platform: 'facebook', category: 'event' },
  { pattern: /fb\.me/i, platform: 'facebook', category: 'event' },

  // Code forges
  {
    pattern: /github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+/i,
    platform: 'github',
    category: 'other'
  }
];

/**
 * Detects platform and category from a URL
 */
/**
 * Platforms that belong in a given category, for pickers.
 *
 * Derived from the same table that powers URL detection, so a platform added
 * for detection turns up in the picker without a second list to remember.
 *
 * `EXTRA_STREAMING` covers services delivered to but not detectable from a URL
 * yet — a release goes to Amazon and Qobuz whether or not we recognise their
 * link format, and a picker that can't offer them is one you work around.
 */
const EXTRA_STREAMING = [
  'amazon_music',
  'qobuz',
  'pandora',
  'anghami',
  'audiomack',
  'boomplay',
  'jiosaavn',
  'kkbox',
  'netease',
  'napster',
  'awa',
  'flo',
  'claro_musica',
  'tencent'
];

export function platformsInCategory(category: PlatformCategory): string[] {
  const detected = platformPatterns
    .filter((entry) => entry.category === category)
    .map((entry) => entry.platform);

  const all = category === 'streaming' ? [...detected, ...EXTRA_STREAMING] : detected;

  // Declaration order puts the services people actually use first; dedupe
  // because a platform can match several patterns.
  return [...new Set(all)];
}

export function detectPlatformFromUrl(url: string): PlatformInfo | null {
  for (const { pattern, platform, category } of platformPatterns) {
    if (pattern.test(url)) {
      return { platform, category };
    }
  }
  return null;
}

/**
 * Gets the icon path for a platform
 */
/**
 * Names that title-casing gets wrong.
 *
 * Most keys are fine capitalised word by word — `apple_music` becomes "Apple
 * Music". These aren't: they carry capitals inside the word, and a service's
 * own name is the one string you don't get to approximate.
 */
const PLATFORM_NAMES: Record<string, string> = {
  youtube: 'YouTube',
  youtube_music: 'YouTube Music',
  soundcloud: 'SoundCloud',
  tiktok: 'TikTok',
  bandsintown: 'Bandsintown',
  seetickets: 'See Tickets',
  github: 'GitHub',
  dice: 'DICE',
  tidal: 'TIDAL',
  amazon_music: 'Amazon Music',
  amazon: 'Amazon',
  apple_podcasts: 'Apple Podcasts',
  // Services EmuBands delivers to. No icons for most of these — a link still
  // renders, with its initial in place of a mark — but the names have to be
  // right the moment one is added.
  jiosaavn: 'JioSaavn',
  iheartradio: 'iHeartRadio',
  kkbox: 'KKBOX',
  netease: 'NetEase',
  audiomack: 'Audiomack',
  anghami: 'Anghami',
  boomplay: 'Boomplay',
  qobuz: 'Qobuz',
  pandora: 'Pandora',
  napster: 'Napster',
  shazam: 'Shazam',
  awa: 'AWA',
  flo: 'FLO',
  tdc: 'TDC',
  tencent: 'Tencent',
  peloton: 'Peloton',
  medianet: 'MediaNet',
  claro_musica: 'Claro Música',
  sevendigital: '7digital'
};

/**
 * Human-readable name for a platform key, shown wherever a platform is named —
 * the release admin, link labels, the stats table.
 */
export function platformLabel(platform: string): string {
  return (
    PLATFORM_NAMES[platform] ??
    platform
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/**
 * A brand colour that can actually be seen against a given background.
 *
 * Several brands are black — TIDAL, TikTok, X, DICE — which is invisible on a
 * dark page, and a few are near-white, which disappears on a light one. Rather
 * than keeping a second palette per theme, this measures the contrast and falls
 * back to the page's own text colour when the brand can't carry itself.
 *
 * Relative luminance per WCAG; below 1.6 is where a solid silhouette stops
 * reading as a shape.
 */
function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastSafeColor(
  platform: string,
  background: string,
  fallback = 'currentColor'
): string {
  const brand = platformColors[platform];
  if (!brand) return fallback;

  const brandLuminance = relativeLuminance(brand);
  const backgroundLuminance = relativeLuminance(background);
  if (brandLuminance === null || backgroundLuminance === null) return brand;

  const lighter = Math.max(brandLuminance, backgroundLuminance);
  const darker = Math.min(brandLuminance, backgroundLuminance);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return ratio < 1.6 ? fallback : brand;
}

export function getPlatformIcon(platform: string): string | null {
  return platformIcons[platform] ?? null;
}

/**
 * Gets the brand color for a platform
 */
export function getPlatformColor(platform: string, fallback = 'var(--theme-primary)'): string {
  return platformColors[platform] ?? fallback;
}

/**
 * Gets platform info from URL with icon and color
 */
export function getPlatformInfoFromUrl(url: string): {
  platform: string;
  category: PlatformCategory;
  icon: string | null;
  color: string;
} | null {
  const info = detectPlatformFromUrl(url);
  if (!info) return null;

  return {
    ...info,
    icon: getPlatformIcon(info.platform),
    color: getPlatformColor(info.platform)
  };
}

// ============================================================================
// ID Extraction Functions
// ============================================================================

/**
 * Extract Spotify artist ID from a Spotify URL
 * Supports: open.spotify.com/artist/ID, spotify:artist:ID
 */
export function extractSpotifyArtistId(url: string): string | null {
  try {
    // Handle spotify: URI format
    if (url.startsWith('spotify:artist:')) {
      return url.split(':')[2] || null;
    }

    const parsed = new URL(url);
    if (!parsed.hostname.includes('spotify.com')) return null;

    // Pattern: /artist/{id}
    const match = parsed.pathname.match(/\/artist\/([a-zA-Z0-9]+)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

/**
 * Extract YouTube channel ID from a YouTube URL
 * Supports: youtube.com/channel/ID, youtube.com/@handle, youtube.com/c/name
 */
export function extractYouTubeChannelId(
  url: string
): { id: string; type: 'channel' | 'handle' | 'custom' } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com') && !parsed.hostname.includes('youtu.be')) {
      return null;
    }

    // Pattern: /channel/UCxxxxxx
    const channelMatch = parsed.pathname.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    if (channelMatch) {
      return { id: channelMatch[1], type: 'channel' };
    }

    // Pattern: /@handle
    const handleMatch = parsed.pathname.match(/\/@([a-zA-Z0-9_-]+)/);
    if (handleMatch) {
      return { id: handleMatch[1], type: 'handle' };
    }

    // Pattern: /c/customname or /user/username
    const customMatch = parsed.pathname.match(/\/(c|user)\/([a-zA-Z0-9_-]+)/);
    if (customMatch) {
      return { id: customMatch[2], type: 'custom' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract SoundCloud username from a SoundCloud URL
 */
export function extractSoundCloudUsername(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('soundcloud.com')) return null;

    // Pattern: soundcloud.com/username
    const match = parsed.pathname.match(/^\/([a-zA-Z0-9_-]+)/);
    if (
      match &&
      !['discover', 'stream', 'search', 'upload', 'you', 'messages'].includes(match[1])
    ) {
      return match[1];
    }
    return null;
  } catch {
    return null;
  }
}
