//------------------------------------------------------------------------------
//  Import options:
//
//  initialMemory: number = 32 * 1024 * 1024
//  allowMemoryGrowth: boolean = true
//  stackSize: number = 512 * 1024
//  useEmmalloc: boolean = true
//  useFilesystem: boolean = false
//  useLTO: boolean = true (only in release mode)
//  useClosure: boolean = true (only in release mode)
//  useMinimalShellFile: boolean = true
//
import * as fibs from 'jsr:@floooh/fibs';
import * as colors from 'jsr:@std/fmt/colors';

const EMSDK_URL = 'https://github.com/emscripten-core/emsdk.git';

export function configure(c: fibs.Configurer) {
    c.addCommand({ name: 'emsdk', help: cmdHelp, run: cmdRun });
    c.addRunner({ name: 'emscripten', run: runnerRun });
    addConfigs(c);
}

export function build(b: fibs.Builder) {
    if (b.isEmscripten()) {
        b.addCmakeInclude('emscripten.include.cmake');
        // FIXME: import options need to be more ergonomic
        const initialMemory = (b.importOption('initialMemory') ?? (32 * 1024 * 1024)) as number;
        const allowMemoryGrowth = (b.importOption('allowMemoryGrowth') ?? true) as boolean;
        const stackSize = (b.importOption('stackSize') ?? (512 * 1024)) as number;
        const useEmmalloc = (b.importOption('useEmmalloc') ?? true) as boolean;
        const useFilesystem = (b.importOption('useFilesystem') ?? false) as boolean;
        const useLto = (b.importOption('useLTO') ?? true) as boolean;
        const useClosure = (b.importOption('useClosure') ?? true) as boolean;
        const useMinimalShellFile = (b.importOption('useMinimalShellFile') ?? true) as boolean;
        b.addLinkOptions([`-sINITIAL_MEMORY=${initialMemory}`, `-sSTACK_SIZE=${stackSize}`]);
        if (allowMemoryGrowth) {
            b.addLinkOptions(['-sALLOW_MEMORY_GROWTH=1']);
        }
        if (useEmmalloc) {
            b.addLinkOptions([`-sMALLOC='emmalloc'`]);
        }
        if (!useFilesystem) {
            b.addLinkOptions(['-sNO_FILESYSTEM=1']);
        }
        if (useLto) {
            b.addCompileOptions({ opts: ['-flto'], buildMode: 'release' });
            b.addLinkOptions({ opts: ['-flto'], buildMode: 'release' });
        }
        if (useClosure) {
            b.addLinkOptions({ opts: ['--closure 1'], buildMode: 'release' });
        }
        if (useMinimalShellFile) {
            b.addLinkOptions([`--shell-file=${b.selfDir()}/shell.html`]);
        }
    }
}

function addConfigs(c: fibs.Configurer) {
    const baseConfig: fibs.ConfigDesc = {
        name: 'emsc',
        platform: 'emscripten',
        runner: 'emscripten',
        compilers: ['clang'],
        buildMode: 'debug',
        toolchainFile: `${c.sdkDir()}/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`,
        validate: (project: fibs.Project) => {
            if (!fibs.util.dirExists(emsdkDir(project))) {
                return {
                    valid: false,
                    hints: [`Emscripten SDK not installed (run 'fibs emsdk install')`],
                };
            } else {
                return { valid: true, hints: [] };
            }
        },
    };
    c.addConfig({ ...baseConfig, name: 'emsc-make-debug', generator: 'make', buildMode: 'debug' });
    c.addConfig({ ...baseConfig, name: 'emsc-make-release', generator: 'make', buildMode: 'release' });
    c.addConfig({ ...baseConfig, name: 'emsc-ninja-debug', generator: 'ninja', buildMode: 'debug' });
    c.addConfig({ ...baseConfig, name: 'emsc-ninja-release', generator: 'ninja', buildMode: 'release' });
    c.addConfig({ ...baseConfig, name: 'emsc-vscAde-debug', generator: 'ninja', buildMode: 'debug', opener: 'vscode' });
    c.addConfig({
        ...baseConfig,
        name: 'emsc-vscode-release',
        generator: 'ninja',
        buildMode: 'release',
        opener: 'vscode',
    });
}

function cmdHelp() {
    fibs.log.helpCmd([
        'emsdk install [version=latest]',
        'emsdk list',
        'emsdk uninstall',
    ], 'install and maintain the Emscripten SDK');
}

async function cmdRun(project: fibs.Project, cmdLineArgs: string[]) {
    const args = parseArgs(cmdLineArgs);
    if (args.install && args.version) {
        await install(project, args.version);
    } else if (args.list) {
        await list(project);
    } else if (args.uninstall) {
        uninstall(project);
    }
}

async function runnerRun(
    project: fibs.Project,
    config: fibs.Config,
    target: fibs.Target,
    _options: fibs.RunOptions,
) {
    await emrun(project, { cwd: project.distDir(config.name), file: `${target.name}.html` });
}

export async function emrun(project: fibs.Project, options: { cwd: string; file: string }) {
    const { cwd, file } = options;
    const emrunFilename = project.isHostWindows() ? 'emrun.bat' : 'emrun';
    const emrunPath = `${project.sdkDir()}/emsdk/upstream/emscripten/${emrunFilename}`;
    // on macOS, explicitly use Chrome instead of Safari, emrun picks Safari even
    // when Chrome is set as the system default browser
    // FIXME: this should be configurable via cmdline args
    let forceChromeArgs: string[] = [];
    if (project.isHostMacOS()) {
        forceChromeArgs = ['--browser', 'chrome'];
    }
    await fibs.util.runCmd(emrunPath, {
        cwd,
        args: [...forceChromeArgs, file],
    });
}

function parseArgs(cmdLineArgs: string[]): {
    install?: boolean;
    list?: boolean;
    uninstall?: boolean;
    version?: string;
} {
    const args: ReturnType<typeof parseArgs> = {};
    if (cmdLineArgs[1] === undefined) {
        fibs.log.panic("expected a subcommand (run 'fibs help emsdk')");
    }
    switch (cmdLineArgs[1]) {
        case 'install':
            args.install = true;
            args.version = cmdLineArgs[2];
            if (args.version === undefined) {
                args.version = 'latest';
            }
            break;
        case 'list':
            args.list = true;
            break;
        case 'uninstall':
            args.uninstall = true;
            break;
        default:
            fibs.log.panic(
                `unknown subcommand '${cmdLineArgs[1]} (run 'fibs help emsdk')`,
            );
    }
    return args;
}

function emsdkDir(project: fibs.Project): string {
    return `${project.sdkDir()}/emsdk`;
}

async function emsdk(project: fibs.Project, args: string[]): Promise<number> {
    const cmd = `${emsdkDir(project)}/emsdk`;
    if (!fibs.util.fileExists(cmd)) {
        fibs.log.panic(
            `emsdk tool not found at ${cmd}, run 'fibs emsdk install`,
        );
    }
    const res = await fibs.util.runCmd(cmd, {
        args,
        cwd: emsdkDir(project),
        winUseCmd: true,
    });
    return res.exitCode;
}

async function install(project: fibs.Project, version: string) {
    await cloneOrUpdateEmsdk(project);
    await emsdk(project, [
        'install',
        '--shallow',
        '--disable-assertions',
        version,
    ]);
    await activate(project, version);
}

async function activate(project: fibs.Project, version: string) {
    fibs.log.section(`activing emsdk version '${version}'`);
    await emsdk(project, ['activate', '--embedded', version]);
}

async function cloneOrUpdateEmsdk(project: fibs.Project) {
    const sdkRoot = fibs.util.ensureSdkDir(project);
    const dir = emsdkDir(project);
    if (fibs.util.dirExists(dir)) {
        fibs.log.section(`updating emsdk in ${dir}`);
        await fibs.git.update({ dir, url: EMSDK_URL, force: true });
    } else {
        fibs.log.section(`cloning emsdk to ${dir} `);
        await fibs.git.clone({ url: EMSDK_URL, dir: sdkRoot });
    }
}

async function list(project: fibs.Project) {
    await emsdk(project, ['list']);
}

function uninstall(project: fibs.Project) {
    const dir = emsdkDir(project);
    if (fibs.util.dirExists(dir)) {
        if (fibs.log.ask(`Delete directory ${dir}?`, false)) {
            fibs.log.info(`deleting ${dir}...`);
            Deno.removeSync(dir, { recursive: true });
            fibs.log.info(colors.green('done.'));
        } else {
            fibs.log.info('nothing to do.');
        }
    } else {
        fibs.log.warn('Emscripten SDK not installed, nothing to do.');
    }
}
