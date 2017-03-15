import {createScuttlebot} from './scuttlebot';
import {setupDiscoveryPeer} from './discovery';
import {setupExpressApp} from './http';

const {ssbBot, ssbConf} = createScuttlebot();
setupDiscoveryPeer({bot: ssbBot, config: ssbConf});
setupExpressApp({bot: ssbBot});
