import {setupScuttlebot} from './scuttlebot';
import {setupDiscoveryPeer} from './discovery';
import {setupExpressApp} from './http';

const {ssbBot, ssbConf} = setupScuttlebot();
setupDiscoveryPeer({bot: ssbBot, config: ssbConf});
setupExpressApp({bot: ssbBot});
