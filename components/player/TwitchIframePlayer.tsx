"use client";

interface TwitchIframePlayerProps {
  channel: string;
  parent: string;
}

export default function TwitchIframePlayer({ channel, parent }: TwitchIframePlayerProps) {
  const parentDomain = parent || 'localhost';
  const iframeSrc = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentDomain)}&muted=false&autoplay=true&theme=dark&controls=true&quality=1080p60`;

  return (
    <iframe
      src={iframeSrc}
      className="w-full h-full"
      allow="autoplay; fullscreen; picture-in-picture"
      sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
      style={{ visibility: 'visible' }}
      referrerPolicy="strict-origin-when-cross-origin"
      scrolling="no"
      frameBorder="0"
    />
  );
}
