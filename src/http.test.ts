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

import request = require('supertest');
import {Response} from '@types/supertest';
import {setupExpressApp} from './http';
import htmlLooksLike = require('html-looks-like');

describe('easy-ssb-pub http server', function () {
  it('should display welcome and bot id on route "/"', function (done) {
    const scuttlebot = {
      id: '@FakeIdGoesHere=.ed25519',
      invite: {
        create: () => {},
      },
    };

    const server = setupExpressApp({bot: scuttlebot, port: 4000});

    request(server)
      .get('/')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(200)
      .expect((res: Response) => {
        const expected = `
          {{ ... }}
          <html>
          <head>
            {{ meta tags }}
            <meta name="description" content="Secure Scuttlebutt Pub Server"/>
            <title>Secure Scuttlebutt Pub Server</title>
            {{ style }}
          </head>
          <body>
            <h1><a href="https://ssbc.github.io/docs/">Secure Scuttlebutt</a><br />
            is a P2P network ideal for data, identity, and messaging</h1>
            <p>Welcome to the SSB Pub server whose id is <code>${scuttlebot.id}</code></p>
            <p><a class="show-qr" href="#">(Show QR code)</a></p>
            <svg class="qr-code" style="display:none;">{{ ... }}</svg>
            <p><a class="invited" href="/invited">Get an invitation</a></p>
            <footer>{{ }}</footer>
            {{ ... }}
          </body>
          </html>
        `;
        htmlLooksLike((res as any).text, expected);
      })
      .end(() => server.close(done));
  });

  it('should display invitation on route "/invited"', function (done) {
    const invitation = 'my fake invitation goes here';
    const scuttlebot = {
      id: '@FakeIdGoesHere=.ed25519',
      invite: {
        create: (amount: number, cb: Function) => {
          cb(null, invitation);
        },
      },
    };

    const server = setupExpressApp({bot: scuttlebot, port: 4000});

    request(server)
      .get('/invited')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(200)
      .expect((res: Response) => {
        const expected = `
          {{ ... }}
          <html>
          <head>
            {{ meta tags }}
            <meta name="description" content="Secure Scuttlebutt Pub Server"/>
            <title>Secure Scuttlebutt Pub Server</title>
            {{ style }}
          </head>
          <body>
            <h1>Here is your personal invitation</h1>
            <p><code>${invitation}</code></p>
            <p><a class="show-qr" href="#">(Show QR code)</a></p>
            <svg class="qr-code" style="display:none;">{{...}}</svg>
            <p>
              You can copy and paste this code into an application like
              <a href="https://ssbc.github.io/patchwork/">Patchwork</a>,
              <a href="https://github.com/ssbc/patchbay">Patchbay</a>, or
              <a href="https://github.com/mmckegg/patchwork-next">Patchwork-next</a>
              to join the social network.
            </p>
            <footer>{{ }}</footer>
            {{ ... }}
          </body>
          </html>
        `;
        htmlLooksLike((res as any).text, expected);
      })
      .end(() => server.close(done));
  });
});