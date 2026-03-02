// NOTE: this is wip!
import { Configurer, Builder, ConfigDesc, log } from 'jsr:@floooh/fibs@^1';

export function configure(c: Configurer) {
    addConfigs(c);
    c.addSetting({
        name: 'iosteamid',
        default: 'noteamid',
        validate: () => ({ valid: true, hint: ''}),
    });
}

export function build(b: Builder) {
    if (b.activeConfig().platform === 'ios') {
        if (b.setting('iosteamid').value === b.setting('iosteamid').default) {
            log.warn(`No 'iosteamid' setting provided, only simulator builds supported`);
        }
        if (b.activeConfig().generator !== 'xcode') {
            log.warn('Building for ios only supported with Xcode generator');
        }
    }
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
    c.addConfig({ ...baseConfig, name: 'ios-arc-xcode-debug', buildMode: 'debug' });
    c.addConfig({ ...baseConfig, name: 'ios-arc-xcode-release', buildMode: 'release' });

    // inject a couple of default plist and Xcode attributes
    c.addTargetAttributeInjector({
        name: 'ios-plist-attrs',
        fn: (t, project, config): void => {
            if (config.platform === 'ios') {
                const useARC = config.name.includes('ios-arc-');
                t.addProperties({
                    XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY: '"iPhone Developer"',
                    XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC: useARC ? "YES" : "NO",
                    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER: '\\${PRODUCT_NAME}',
                    MACOSX_BUNDLE_GUI_IDENTIFIER: '\\${PRODUCT_NAME}',
                    MACOSX_BUNDLE_EXECUTABLE_NAME: '\\${EXECUTABLE_NAME}',
                    MACOSX_BUNDLE_PRODUCT_NAME: '\\${PRODUCT_NAME}',
                    MACOSX_BUNDLE_BUNDLE_NAME: '\\${PRODUCT_NAME}',
                });
                const iosTeamId = project.setting('iosteamid').value;
                if (iosTeamId !== project.setting('iosteamid').default) {
                    t.addProperties({
                        XCODE_ATTRIBUTE_DEVELOPMENT_TEAM: iosTeamId,
                    });
                }
            }
        }
    });
}