/*
easy-ssb-pub: an easy way to deploy a Secure Scuttlebutt Pub.

Copyright (C) 2017 Andre 'Staltz' Medeiros (staltz.com)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import ssbClient = require('scuttlebot');
import minimist = require('minimist');
import ssbKeys = require('ssb-keys');
import confInject = require('ssb-config/inject');
import path = require('path');
import {SBOT_PORT, debug} from './config';
import fs = require('fs');

export interface SSBConfig {
  party: boolean;
  host: string;
  port: number;
  timeout: number;
  pub: boolean;
  local: boolean;
  discovery?: boolean;
  friends: {
    dunbar: number;
    hops: number;
  };
  ws: {
    port: number;
  };
  gossip: {
    connections: number;
  };
  path: string;
  timers: {
    connection: number;
    reconnect: number;
    ping: number;
    handshake: number;
  };
  caps: {
    shs: string;
  };
  swarm: {
    port: number;
    maxPeers: number;
  };
  keys: {
    curve: 'ed25519',
    public: string;
    private: string;
    id: string;
  };
}

export type AccountKey = string;

export interface SSBPeer {
  state: 'connecting' | 'connected' | 'disconnecting' | null;
  host: string;
  port: number;
  key: AccountKey;
  source: 'pub' | 'manual' | 'local';
  announcers: number;
}

export type MsgKey = string;

export interface Msg {
  key: MsgKey; // e.g. %jpBMeL8riakqxxrVaVzXSBvtT6wQQ7Q/F5+bQAaAASo=.sha256
  value: {
    previous: MsgKey;
    author: AccountKey;
    sequence: number;
    timestamp: number;
    hash: 'sha256';
    content: {
      type: 'post' | 'about' | 'like' | 'follow';
      text: string;
      root: MsgKey;
      branch: MsgKey;
    };
  };
  isMention?: boolean;
  related?: Array<Msg>;
  signature: string;
  timestamp: number;
}

export interface Scuttlebot {
  peers: any;
  publicKey: Buffer;
  auth: Function;
  address: Function;
  getAddress: Function;
  manifest: Function;
  getManifest: Function;
  conf: SSBConfig;
  connect: Function;
  close: Function;
  /**
   * e.g. '@QlCTpvY7p9ty2yOFrv1WU1AE88aoQc4Y7wYal7PFc+w=.ed25519'
   */
  id: string;
  keys: {
    curve: string;
    public: string;
    private: string;
    /**
     * e.g. '@QlCTpvY7p9ty2yOFrv1WU1AE88aoQc4Y7wYal7PFc+w=.ed25519'
     */
    id: string;
  };
  usage: Function;
  publish: Function;
  add: Function;
  get: Function;
  pre: Function;
  post: Function;
  latest: Function;
  getLatest: Function;
  latestSequence: Function;
  createFeed: Function;
  whoami: Function;
  relatedMessages: Function;
  query: {
    read(opts: any): any;
  };
  createFeedStream: Function;
  createHistoryStream: Function;
  createLogStream: Function;
  createUserStream: Function;
  links: Function;
  sublevel: Function;
  messagesByType: Function;
  createWriteStream: Function;
  plugins: {
    install: Function;
    uninstall: Function;
    enable: Function;
    disable: Function;
  };
  gossip: {
    wakeup: number;
    peers(): Array<SSBPeer>;
    get: Function;
    connect: Function;
    disconnect: Function;
    changes: Function;
    add: Function;
    remove: Function;
    ping: Function;
    reconnect: Function;
  };
  friends: {
    get: Function;
    all: Function;
    path: Function;
    createFriendStream: Function;
    hops: Function;
  };
  replicate: {
    changes: Function;
    upto: Function;
  };
  blobs: {
    has: Function;
    size: Function;
    get: Function;
    add: Function;
    ls: Function;
    changes: Function;
    want(hash: string, cb: (err: any, has: boolean) => void): void;
    push: Function;
    pushed: Function;
    createWants: Function;
  };
  invite: {
    create: Function;
    accept(err: any, results: any): void;
  };
  block: {
    isBlocked: Function;
  };
  local: any;
  private: {
    publish: Function;
    unbox: Function;
  };
}

/**
 * Sets up and runs a Scuttlebot.
 * @param {Options} opts
 */
export function setupScuttlebot(): {ssbBot: Scuttlebot, ssbConf: SSBConfig} {
  let argv = process.argv.slice(2);
  const i = argv.indexOf('--');
  const conf = argv.slice(i + 1);
  argv = ~i ? argv.slice(0, i) : argv;

  const ssbConf: SSBConfig = confInject(process.env.ssb_appname, minimist(conf));
  ssbConf.keys = ssbKeys.loadOrCreateSync(path.join(ssbConf.path, 'secret'));
  ssbConf.port = SBOT_PORT;
  ssbConf.swarm = {port: 8007, maxPeers: 3};
  const createSbot = ssbClient
      .use(require('scuttlebot/plugins/plugins'))
      .use(require('scuttlebot/plugins/master'))
      .use(require('scuttlebot/plugins/gossip'))
      .use(require('scuttlebot/plugins/replicate'))
      .use(require('ssb-friends'))
      .use(require('ssb-blobs'))
      .use(require('scuttlebot/plugins/invite'))
      .use(require('scuttlebot/plugins/local'))
      .use(require('scuttlebot/plugins/logging'))
      .use(require('ssb-query'))
      .use(require('ssb-links'))
      .use(require('ssb-ws'))
      .use(require('ssb-ebt'))
      //.use(require('ssb-discovery-swarm'))
      .use(require('ssb-autoname'));
  const ssbBot: Scuttlebot = createSbot(ssbConf);

  const manifestFile = path.join(ssbConf.path, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(ssbBot.getManifest(), null, 2));

  ssbBot.conf = ssbConf;
  ssbBot.address((err: any, addr: string) => {
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      debug('Scuttlebot app is running on address %s', addr);
    }
  });

  return {ssbBot, ssbConf};
}
