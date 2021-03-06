/* eslint-env jest */
/* eslint-disable global-require, import/no-dynamic-require */

import { merge } from 'timm';
import semver from 'semver';
import publish from '../publish';

jest.mock('../utils/shell');
jest.mock('../utils/writeSpecs');
jest.mock('../utils/git');

const NOMINAL_OPTIONS = {
  src: 'test/fixtures/packages/*',
  master: true,
  confirm: false,
  _autoVersion: true,
};
const NUM_FIXTURE_SUBPACKAGES = 4;

describe('PUBLISH command', () => {
  let git;
  beforeEach(() => {
    git = require('../utils/git');
    git._initStubs();
  });

  it('throws when current branch is not master', async () => {
    git._setBranch('non-master');
    try {
      await publish(NOMINAL_OPTIONS);
      throw new Error('DID_NOT_THROW');
    } catch (err) {
      if (err.message !== 'BRANCH_CHECK_FAILED') throw err;
    }
  });

  it('allows overriding the non-master check', async () => {
    git._setBranch('non-master');
    await publish(merge(NOMINAL_OPTIONS, { master: false }));
  });

  it('throws with uncommitted changes', async () => {
    git._setUncommitted('SOMETHING_HAS_NOT_YET_BEEN_COMMITTED');
    try {
      await publish(NOMINAL_OPTIONS);
      throw new Error('DID_NOT_THROW');
    } catch (err) {
      if (err.message !== 'UNCOMMITTED_CHECK_FAILED') throw err;
    }
  });

  it('throws with unpulled changes', async () => {
    git._setUnpulled('SOMETHING_HAS_NOT_YET_BEEN_PULLED');
    try {
      await publish(NOMINAL_OPTIONS);
      throw new Error('DID_NOT_THROW');
    } catch (err) {
      if (err.message !== 'UNPULLED_CHECK_FAILED') throw err;
    }
  });

  it('stops when no sub-package is dirty', async () => {
    git._setSubpackageDiff('');
    await publish(NOMINAL_OPTIONS);
    expect(git.gitPushWithTags).not.toHaveBeenCalled();
  });

  it('proceeds if there are dirty sub-packages', async () => {
    await publish(NOMINAL_OPTIONS);
    expect(git.gitPushWithTags).toHaveBeenCalled();
  });

  it('performs a commit-tag-push on dirty sub-packages increasing the version number', async () => {
    const writeSpecs = require('../utils/writeSpecs').default;
    const pkg = require('../../package.json');
    const nextVersion = semver.inc(pkg.version, 'major');
    await publish(NOMINAL_OPTIONS);
    expect(writeSpecs).toHaveBeenCalledTimes(1 + NUM_FIXTURE_SUBPACKAGES);
    writeSpecs.mock.calls.forEach(([, specs]) => {
      expect(specs.version).toEqual(nextVersion);
    });
    expect(git.gitCommitChanges).toHaveBeenCalledTimes(1);
    expect(git.gitAddTag).toHaveBeenCalledTimes(1);
    expect(git.gitPushWithTags).toHaveBeenCalledTimes(1);
  });

  it('runs `npm publish` on dirty sub-packages', async () => {
    const { exec } = require('../utils/shell');
    await publish(NOMINAL_OPTIONS);
    expect(exec).toHaveBeenCalledTimes(NUM_FIXTURE_SUBPACKAGES);
    exec.mock.calls.forEach(([cmd]) => {
      expect(cmd).toEqual('npm publish');
    });
  });

  it('runs `npm publish --tag X` on dirty sub-packages', async () => {
    const { exec } = require('../utils/shell');
    await publish(merge(NOMINAL_OPTIONS, { publishTag: 'next' }));
    expect(exec).toHaveBeenCalledTimes(NUM_FIXTURE_SUBPACKAGES);
    exec.mock.calls.forEach(([cmd]) => {
      expect(cmd).toEqual('npm publish --tag next');
    });
  });
});
