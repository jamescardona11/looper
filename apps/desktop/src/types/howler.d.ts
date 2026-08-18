declare module "howler" {
  type PlaybackId = number | string;
  type PlaybackFailure = (id: PlaybackId, error: unknown) => void;

  export interface HowlOptions {
    src: string[];
    html5?: boolean;
    preload?: boolean | "metadata";
    onload?(): void;
    onloaderror?: PlaybackFailure;
    onplayerror?: PlaybackFailure;
    onplay?(): void;
    onpause?(): void;
    onstop?(): void;
    onend?(): void;
    onseek?(): void;
  }

  export class Howl {
    constructor(options: HowlOptions);
    play(): PlaybackId;
    pause(): this;
    unload(): void;
    playing(): boolean;
    seek(): number;
    seek(position: number): this;
    duration(): number;
    rate(value: number): this;
  }
}
