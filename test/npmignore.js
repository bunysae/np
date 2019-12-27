import path from 'path';
import test from 'ava';
import mockery from 'mockery';
import sinon from 'sinon';

let moduleUnderTest;

const gitUtilApi = {
	async newFilesSinceLastRelease() {
	}
};

const pkgDirApi = {
	sync() {
	}
};

const stubPkgDir = sinon.stub(pkgDirApi, 'sync');

test.before(() => {
	const stubGitUtil = sinon.stub(gitUtilApi, 'newFilesSinceLastRelease');

	mockery.registerAllowable('../source/util');
	mockery.registerAllowable('../source/npm/util');
	mockery.registerMock('./git-util', gitUtilApi);
	mockery.registerMock('pkg-dir', pkgDirApi);

	stubGitUtil.returns(['source/ignore.txt', 'source/pay_attention.txt', '.hg']);

	mockery.enable({
		useCleanCache: true,
		warnOnReplace: false,
		warnOnUnregistered: false
	});

	moduleUnderTest = require('../source/util');
});

test.after(() => {
	mockery.deregisterAll();
	mockery.disable();
});

test('ignored files using file-attribute in package.json with one item', async t => {
	t.deepEqual(await moduleUnderTest.getNewAndUnpublishedFiles({files: ['pay_attention.txt']}),
		['source/ignore.txt']);
});

test('ignored files using file-attribute in package.json with multiple items', async t => {
	t.deepEqual(await moduleUnderTest.getNewAndUnpublishedFiles(
		{files: ['pay_attention.txt', 'ignore.txt']}), []);
});

test.serial('ignored files using .npmignore', async t => {
	stubPkgDir.returns(path.resolve('test', 'fixtures', 'npmignore'));
	t.deepEqual(await moduleUnderTest.getNewAndUnpublishedFiles({name: 'without file-attribute'}),
		['source/ignore.txt']);
});

test.serial('ignore strategy is not used', async t => {
	stubPkgDir.returns(path.resolve('test', 'fixtures'));
	t.true(await moduleUnderTest.getNewAndUnpublishedFiles({name: 'without file-attribute'}) === undefined);
});
