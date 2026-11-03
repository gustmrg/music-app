// webtorrent v3 ships no type definitions. This declares only the parts of
// its API that electron/torrent.ts uses.
declare module "webtorrent" {
  import type { EventEmitter } from "node:events"

  // A streamx Readable: async iterable and pipeable, but not a Node stream.
  export interface FileStream extends AsyncIterable<Uint8Array> {
    destroy(error?: Error): void
  }

  export interface TorrentFile extends EventEmitter {
    name: string
    path: string
    length: number
    downloaded: number
    done: boolean
    createReadStream(options?: { start?: number; end?: number }): FileStream
  }

  export interface Torrent extends EventEmitter {
    infoHash: string
    name: string
    files: TorrentFile[]
    destroyed: boolean
    progress: number
    numPeers: number
    downloadSpeed: number
    destroy(callback?: () => void): void
  }

  export interface ClientOptions {
    utp?: boolean
    tracker?: boolean
    dht?: boolean
    lsd?: boolean
  }

  export interface Instance extends EventEmitter {
    add(input: string | Buffer, options: { path: string }, onTorrent: (torrent: Torrent) => void): Torrent
    destroy(callback?: (error?: Error) => void): void
  }

  const WebTorrent: new (options?: ClientOptions) => Instance
  export default WebTorrent
}
