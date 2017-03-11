import request = require('supertest');
import assert = require('assert');
import {Response} from '@types/supertest';
import {createExpressApp} from '../src/http';
import htmlLooksLike = require('html-looks-like');

describe('easy-ssb-pub http server', function () {
  it('should display welcome and bot id on route "/"', function (done) {
    const scuttlebot = {
      id: '@FakeIdGoesHere=.ed25519',
      invite: {
        create: () => {},
        accept: () => {},
      },
    };

    const app = createExpressApp(scuttlebot, 4000);

    request(app)
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
      .end(done);
  });

  it('should display invitation on route "/invited"', function (done) {
    const invitation = 'my fake invitation goes here';
    const scuttlebot = {
      id: '@FakeIdGoesHere=.ed25519',
      invite: {
        create: (amount: number, cb: Function) => {
          cb(null, invitation);
        },
        accept: () => {},
      },
    };

    const app = createExpressApp(scuttlebot, 4001);

    request(app)
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
      .end(done);
  });

  it('should display JSON invitation on route "/invited/json"', function (done) {
    const invitation = 'my fake invitation goes here';
    const scuttlebot = {
      id: '@FakeIdGoesHere=.ed25519',
      invite: {
        create: (amount: number, cb: Function) => {
          cb(null, invitation);
        },
        accept: () => {},
      },
    };

    const app = createExpressApp(scuttlebot, 4002);

    request(app)
      .get('/invited/json')
      .expect('Content-Type', 'application/json; charset=utf-8')
      .expect(200)
      .expect((res: Response) => {
        assert.strictEqual(JSON.stringify(res.body), `{"invitation":"${invitation}"}`);
      })
      .end(done);
  });
});