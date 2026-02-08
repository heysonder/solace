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
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; storage-access"
      style={{ visibility: 'visible' }}
      referrerPolicy="no-referrer-when-downgrade"
      scrolling="no"
      frameBorder="0"
    />
  );
}
