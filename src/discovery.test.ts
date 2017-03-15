import assert = require('assert');
import express = require('express');
import {setupDiscoveryPeer, SwarmPeer, PeerInfo} from './discovery';
import {SWARM_ID_PREFIX} from './config';
const pkg = require('../package.json');
export const version = pkg.version;

describe('easy-ssb-pub discovery peer', function () {
  it('should allow Alice to find Bob and get an invite from him', function (done) {
    const BOB_HTTP_PORT = 4000;
    const bobServer = express().get('/invited/json', (req: any, res: any) =>
      res.json({invitation: 'The Invitation Goes Here'}),
    ).listen(BOB_HTTP_PORT);

    const ssbBotA = {
      invite: {
        create: (amount: number, cb: Function) => {
          done('alice bot.invite.create should not be called');
        },
        accept: (invitation: string) => {
          assert.strictEqual(invitation, 'The Invitation Goes Here');
          bobServer.close(done);
        },
      },
      gossip: {
        peers: () => [],
      },
    };

    const ssbConf = {host: 'localhost'};

    const peerA: SwarmPeer = {
      listen: (port: number) => {},
      join: (key: string, opts: any, cb: Function) => {},
      on: (event: 'connection', cb: Function) => {
        const peerInfoB: PeerInfo = {
          id: SWARM_ID_PREFIX + version,
          host: 'localhost:' + BOB_HTTP_PORT,
          port: 4001,
        };
        cb(null, peerInfoB);
      },
    };

    setupDiscoveryPeer({bot: ssbBotA, config: ssbConf, peer: peerA, port: 4002});
  });

  it('should make Alice ignore Bob if already connected to him', function (done) {
    const BOB_HTTP_PORT = 4000;
    const bobServer = express().get('/invited/json', (req: any, res: any) =>
      res.json({invitation: 'The Invitation Goes Here'}),
    ).listen(BOB_HTTP_PORT);

    const ssbBotA = {
      id: '@Alice=.ed25519',
      invite: {
        create: (amount: number, cb: Function) => {
          done('alice bot.invite.create should not be called');
        },
        accept: (invitation: string) => {
          done('alice bot.invite.accept should not be called');
        },
      },
      gossip: {
        peers: () => [
          {host: 'localhost:' + BOB_HTTP_PORT, state: 'connected'} as any,
        ],
      },
    };

    const ssbConf = {host: 'localhost'};

    const peerA: SwarmPeer = {
      listen: (port: number) => {},
      join: (key: string, opts: any, cb: Function) => {},
      on: (event: 'connection', cb: Function) => {
        const peerInfoB: PeerInfo = {
          id: SWARM_ID_PREFIX + version,
          host: 'localhost:' + BOB_HTTP_PORT,
          port: 4001,
        };
        cb(null, peerInfoB);
      },
    };

    setupDiscoveryPeer({bot: ssbBotA, config: ssbConf, peer: peerA, port: 4002});

    this.timeout(1500);
    setTimeout(() => bobServer.close(done), 1000);
  });

  it('should make Alice ignore Bob if already connected to many pubs', function (done) {
    const BOB_HTTP_PORT = 4000;
    const bobServer = express().get('/invited/json', (req: any, res: any) =>
      res.json({invitation: 'The Invitation Goes Here'}),
    ).listen(BOB_HTTP_PORT);

    const ssbBotA = {
      id: '@Alice=.ed25519',
      invite: {
        create: (amount: number, cb: Function) => {
          done('alice bot.invite.create should not be called');
        },
        accept: (invitation: string) => {
          done('alice bot.invite.accept should not be called');
        },
      },
      gossip: {
        peers: () => [
          {host: 'test1.local', state: 'connected'} as any,
          {host: 'test2.local', state: 'connected'} as any,
          {host: 'test3.local', state: 'connected'} as any,
          {host: 'test4.local', state: 'connected'} as any,
        ],
      },
    };

    const ssbConf = {host: 'localhost'};

    const peerA: SwarmPeer = {
      listen: (port: number) => {},
      join: (key: string, opts: any, cb: Function) => {},
      on: (event: 'connection', cb: Function) => {
        const peerInfoB: PeerInfo = {
          id: SWARM_ID_PREFIX + version,
          host: 'localhost:' + BOB_HTTP_PORT,
          port: 4001,
        };
        cb(null, peerInfoB);
      },
    };

    setupDiscoveryPeer({bot: ssbBotA, config: ssbConf, peer: peerA, port: 4002});

    this.timeout(1500);
    setTimeout(() => bobServer.close(done), 1000);
  });

  it('should make Alice ignore Bob if it has an older version', function (done) {
    const BOB_HTTP_PORT = 4000;
    const bobServer = express().get('/invited/json', (req: any, res: any) =>
      res.json({invitation: 'The Invitation Goes Here'}),
    ).listen(BOB_HTTP_PORT);

    const ssbBotA = {
      invite: {
        create: (amount: number, cb: Function) => {
          done('alice bot.invite.create should not be called');
        },
        accept: (invitation: string) => {
          done('alice bot.invite.accept should not be called');
        },
      },
      gossip: {
        peers: () => [],
      },
    };

    const ssbConf = {host: 'localhost'};

    const peerA: SwarmPeer = {
      listen: (port: number) => {},
      join: (key: string, opts: any, cb: Function) => {},
      on: (event: 'connection', cb: Function) => {
        const peerInfoB: PeerInfo = {
          id: SWARM_ID_PREFIX + '0.123',
          // Test should fail if this is used instead:
          // id: SWARM_ID_PREFIX + version,
          host: 'localhost:' + BOB_HTTP_PORT,
          port: 4001,
        };
        cb(null, peerInfoB);
      },
    };

    setupDiscoveryPeer({bot: ssbBotA, config: ssbConf, peer: peerA, port: 4002});

    this.timeout(1500);
    setTimeout(() => bobServer.close(done), 1000);
  });

  it('should make Alice ignore Bob if it had different discovery id prefix', function (done) {
    const BOB_HTTP_PORT = 4000;
    const bobServer = express().get('/invited/json', (req: any, res: any) =>
      res.json({invitation: 'The Invitation Goes Here'}),
    ).listen(BOB_HTTP_PORT);

    const ssbBotA = {
      invite: {
        create: (amount: number, cb: Function) => {
          done('alice bot.invite.create should not be called');
        },
        accept: (invitation: string) => {
          done('alice bot.invite.accept should not be called');
        },
      },
      gossip: {
        peers: () => [],
      },
    };

    const ssbConf = {host: 'localhost'};

    const peerA: SwarmPeer = {
      listen: (port: number) => {},
      join: (key: string, opts: any, cb: Function) => {},
      on: (event: 'connection', cb: Function) => {
        const peerInfoB: PeerInfo = {
          id: 'BitTorrent',
          // Test should fail if this is used instead:
          // id: SWARM_ID_PREFIX + version,
          host: 'localhost:' + BOB_HTTP_PORT,
          port: 4001,
        };
        cb(null, peerInfoB);
      },
    };

    setupDiscoveryPeer({bot: ssbBotA, config: ssbConf, peer: peerA, port: 4002});

    this.timeout(1500);
    setTimeout(() => bobServer.close(done), 1000);
  });
});