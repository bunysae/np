'use strict';
const fs = require('fs');
const path = require('path');
const execa = require('execa');
const pTimeout = require('p-timeout');
const ow = require('ow');
const npmName = require('npm-name');
const chalk = require('chalk');
const pkgDir = require('pkg-dir');
const ignoreWalker = require('ignore-walk');
const minimatch = require('minimatch');
const {verifyRequirementSatisfied} = require('../version');

exports.checkConnection = () => pTimeout(
	(async () => {
		try {
			await execa('npm', ['ping']);
			return true;
		} catch (_) {
			throw new Error('Connection to npm registry failed');
		}
	})(),
	15000,
	'Connection to npm registry timed out'
);

exports.username = async ({externalRegistry}) => {
	const args = ['whoami'];

	if (externalRegistry) {
		args.push('--registry', externalRegistry);
	}

	try {
		const {stdout} = await execa('npm', args);
		return stdout;
	} catch (error) {
		throw new Error(/ENEEDAUTH/.test(error.stderr) ?
			'You must be logged in. Use `npm login` and try again.' :
			'Authentication error. Use `npm whoami` to troubleshoot.');
	}
};

exports.collaborators = async packageName => {
	ow(packageName, ow.string);

	try {
		const {stdout} = await execa('npm', ['access', 'ls-collaborators', packageName]);
		return stdout;
	} catch (error) {
		// Ignore non-existing package error
		if (error.stderr.includes('code E404')) {
			return false;
		}

		throw error;
	}
};

exports.prereleaseTags = async packageName => {
	ow(packageName, ow.string);

	let tags = [];
	try {
		const {stdout} = await execa('npm', ['view', '--json', packageName, 'dist-tags']);
		tags = Object.keys(JSON.parse(stdout))
			.filter(tag => tag !== 'latest');
	} catch (error) {
		if (((JSON.parse(error.stdout) || {}).error || {}).code !== 'E404') {
			throw error;
		}
	}

	if (tags.length === 0) {
		tags.push('next');
	}

	return tags;
};

exports.isPackageNameAvailable = async pkg => {
	const isExternalRegistry = exports.isExternalRegistry(pkg);
	if (isExternalRegistry) {
		return true;
	}

	return npmName(pkg.name);
};

exports.isExternalRegistry = pkg => typeof pkg.publishConfig === 'object' && typeof pkg.publishConfig.registry === 'string';

exports.version = async () => {
	const {stdout} = await execa('npm', ['--version']);
	return stdout;
};

exports.verifyRecentNpmVersion = async () => {
	const npmVersion = await exports.version();
	verifyRequirementSatisfied('npm', npmVersion);
};

exports.checkIgnoreStrategy = ({files}) => {
	const rootDir = pkgDir.sync();
	const npmignoreExists = fs.existsSync(path.resolve(rootDir, '.npmignore'));

	if (!files && !npmignoreExists) {
		console.log(`
		\n${chalk.bold.yellow('Warning:')} No ${chalk.bold.cyan('files')} field specified in ${chalk.bold.magenta('package.json')} nor is a ${chalk.bold.magenta('.npmignore')} file present. Having one of those will prevent you from accidentally publishing development-specific files along with your package's source code to npm. 
		`);
	}
};

// New files added part of .npmignore or not part of files-attribute in "package.json"
exports.checkNewFiles = async (newFiles, filesFromFileAttribute) => {
	const rootDir = pkgDir.sync();
	const npmignoreExists = fs.existsSync(path.resolve(rootDir, '.npmignore'));

	let result = [];

	if (filesFromFileAttribute) {
		result = getFilesNotPartOfFileAttribute(filesFromFileAttribute, newFiles);
	}

	if (npmignoreExists) {
		result = result.concat(await getFilesIgnoredByDotnpmignore(newFiles));
	}

	return result;
};

async function getFilesIgnoredByDotnpmignore(fileList) {
	if (!Array.isArray(fileList)) {
		throw new TypeError('expected array, but got {typeof fileList}');
	}

	const result = [];
	const whiteList = await ignoreWalker({
		path: pkgDir.sync(),
		ignoreFiles: ['.npmignore']
	});
	for (const file of fileList) {
		const found = whiteList.find(whiteListItem => {
			return whiteListItem === file;
		});
		if (found === undefined) {
			result.push(file);
		}
	}

	return result;
}

function getFilesNotPartOfFileAttribute(filesFromFileAttribute, fileList) {
	if (!Array.isArray(fileList)) {
		throw new TypeError(`expected array, but got ${typeof fileList}`);
	}

	return fileList.filter(minimatch.filter(getGlobPattern(filesFromFileAttribute),
		{matchBase: true}));
}

function getGlobPattern(filesFromFileAttribute) {
	if (filesFromFileAttribute.length === 1) {
		return '!' + filesFromFileAttribute[0];
	}

	return '!{' + filesFromFileAttribute.join(',') + '}';
}
