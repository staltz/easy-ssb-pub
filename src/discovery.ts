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

import net = require('net');
import superagent = require('superagent');
import swarm = require('discovery-swarm');
import {SWARM_PORT, SWARM_ID_PREFIX, MAX_CONNECTED_PUBS, version, debug} from './config';
import {Scuttlebot, SSBConfig, SSBPeer} from './scuttlebot';
import {Pick2} from 'ts-multipick';
import * as Rx from 'rxjs';

// Convert to ComVer:
const localVersion = (/^(\d+\.\d+)\.\d+$/.exec(version) as RegExpExecArray)[1];

export interface PeerInfo {
  id: Buffer | string;
  host: string;
  port: string | number;
}

export interface SwarmPeer {
  listen(port: number): void;
  join(key: string, opts: any, cb: Function): void;
  on(event: 'connection', cb: (connection: net.Socket, info: PeerInfo) => void): void;
}

export type SBotGossipPeers = Pick2<Scuttlebot, 'gossip', 'peers'>;
export type SBotInvite = Pick<Scuttlebot, 'invite'>;

export interface Options {
  bot: SBotGossipPeers & SBotInvite;
  config: Pick<SSBConfig, 'host'> & Pick<SSBConfig, 'discovery'>;
  port?: number;
  peer?: SwarmPeer;
}

function remotePeer$(peer: SwarmPeer): Rx.Observable<PeerInfo> {
  return Rx.Observable.create(function subscribe(observer: Rx.Observer<PeerInfo>) {
    try {
      peer.on('connection', function (connection: net.Socket, info: PeerInfo) {
        observer.next(info);
      });
    } catch (e) {
      observer.error(e);
    }
  });
}

function makeIsCompatibleRemotePeer(host: string) {
  /**
   * Checks whether the remote peer is compatible with the local peer,
   * whether they are meant for the same purpose.
   * @param remoteInfo
   */
  return function compatibleRemotePeer(remoteInfo: PeerInfo): boolean {
    const remoteId = (remoteInfo.id as Buffer).toString('ascii');
    const hasSamePrefix = remoteId.indexOf(SWARM_ID_PREFIX) === 0;
    const isHostNotLocal = remoteInfo.host !== host;
    return hasSamePrefix && isHostNotLocal;
  };
}

/**
 * Checks whether the remote discovery peer has a valid (non-null) host.
 * @param remoteInfo
 */
function validHost(remoteInfo: PeerInfo): boolean {
  return !!remoteInfo.host;
}

/**
 * Checks whether the remote version matches the local version.
 * @param remoteInfo
 */
function versionsMatch(remoteInfo: PeerInfo): boolean {
    const remoteId = (remoteInfo.id as Buffer).toString('ascii');
    const remoteVersion = remoteId.split(SWARM_ID_PREFIX)[1];
    const remoteMajorVer = remoteVersion.split('.')[0];
    const localMajorVer = localVersion.split('.')[0];
    return remoteMajorVer === localMajorVer;
}

function connectedPub(peer: SSBPeer): boolean {
  return peer.state === 'connected';
}

/**
 * Checks whether the remote peer isnt yet in the locally-known connected pubs.
 * @param remoteInfo
 */
function isNewRemotePeer(remoteInfo: PeerInfo, pubs: Array<SSBPeer>): boolean {
  return pubs.filter(connectedPub).every(pub => pub.host !== remoteInfo.host);
}

function requestInvite$(invitationUrl: string): Rx.Observable<superagent.Response> {
  const request = superagent(invitationUrl);
  return Rx.Observable.bindNodeCallback(request.end.bind(request))();
}

/**
 * Sets up and runs a discovery swarm peer. Either takes a peer as input in opts
 * or creates a peer from scratch.
 * @param {Options} opts
 */
export function setupDiscoveryPeer(opts: Readonly<Options>) {
  if (opts.config.discovery === false) {
    return;
  }
  const port = opts.port || SWARM_PORT;
  const peer: SwarmPeer = opts.peer || swarm({
    maxConnections: 1000,
    utp: true,
    id: SWARM_ID_PREFIX + localVersion,
  });

  peer.listen(port);
  peer.join('ssb-discovery-swarm', {announce: true}, function () {
    debug('Joining discovery swarm under the channel "ssb-discovery-swarm"');
  });
  const compatibleRemotePeer = makeIsCompatibleRemotePeer(opts.config.host);
  const expectingMore = () =>
    opts.bot.gossip.peers().filter(connectedPub).length < MAX_CONNECTED_PUBS;
  const acceptInvite$: (invitation: string) => Rx.Observable<any> =
    Rx.Observable.bindNodeCallback<any>(opts.bot.invite.accept);

  remotePeer$(peer)
    .filter(expectingMore)
    .filter(validHost)
    .filter(compatibleRemotePeer)
    .filter(versionsMatch)
    .filter(info => isNewRemotePeer(info, opts.bot.gossip.peers()))
    .do(p =>
      debug('Found discovery swarm peer %s:%s', p.host, p.port),
    )
    .map(info => info.host)
    .mergeMap(remoteHost =>
      Rx.Observable.of(`http://${remoteHost}/invited/json`)
        .do(url => debug(`Asking SSB peer ${url} for an invitation...`))
        .switchMap(requestInvite$)
        .map(res => res.body.invitation as string | undefined | null)
        .filter(x => !!x)
        .do(x => debug(`Got SSB invitation ${x}, will use it to locally...`))
        .switchMap(acceptInvite$)
        .do(() => debug(`Successfully became "SSB friends" with remote peer ${remoteHost}`)),
    )
    .subscribe({
      next: () => {},
      error: e => console.log(e),
    });

  return peer;
}
