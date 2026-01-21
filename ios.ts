// NOTE: this is wip!
import { Configurer, ConfigDesc } from 'jsr:@floooh/fibs@^1';

export function configure(c: Configurer) {
    addConfigs(c);
}

function addConfigs(c: Configurer) {
    const baseConfig: ConfigDesc = {
        name: 'ios',
        platform: 'ios',
        buildMode: 'debug',
        generator: 'xcode',
        opener: 'xcode',
        cmakeCacheVariables: {
            CMAKE_SYSTEM_NAME: 'iOS',
        },
    };
    c.addConfig({ ...baseConfig, name: 'ios-xcode-debug', buildMode: 'debug' });
    c.addConfig({ ...baseConfig, name: 'ios-xcode-release', buildMode: 'release' });
}