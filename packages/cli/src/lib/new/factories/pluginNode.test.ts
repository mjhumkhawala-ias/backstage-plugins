/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs-extra';
import mockFs from 'mock-fs';

import { resolve as resolvePath, sep } from 'path';

import { paths } from '../../paths';
import { Task } from '../../tasks';
import { FactoryRegistry } from '../FactoryRegistry';
import { createMockOutputStream, mockPaths } from './common/testUtils';
import { pluginNode } from './pluginNode';

describe('pluginNode factory', () => {
  beforeEach(() => {
    mockPaths({
      targetRoot: '/root',
    });
  });

  afterEach(() => {
    mockFs.restore();
    jest.resetAllMocks();
  });

  it('should create a node plugin package', async () => {
    mockFs({
      '/root': {
        plugins: mockFs.directory(),
      },
      [paths.resolveOwn('templates')]: mockFs.load(
        paths.resolveOwn('templates'),
      ),
    });

    const options = await FactoryRegistry.populateOptions(pluginNode, {
      id: 'test',
    });

    let modified = false;

    const [output, mockStream] = createMockOutputStream();
    jest.spyOn(process, 'stderr', 'get').mockReturnValue(mockStream);
    jest.spyOn(Task, 'forCommand').mockResolvedValue();

    await pluginNode.create(options, {
      private: true,
      isMonoRepo: true,
      defaultVersion: '1.0.0',
      markAsModified: () => {
        modified = true;
      },
      createTemporaryDirectory: () => fs.mkdtemp('test'),
    });

    expect(modified).toBe(true);

    expect(output).toEqual([
      '',
      'Creating Node.js plugin library backstage-plugin-test-node',
      'Checking Prerequisites:',
      `availability  plugins${sep}test-node`,
      'creating      temp dir',
      'Executing Template:',
      'copying       .eslintrc.js',
      'templating    README.md.hbs',
      'templating    package.json.hbs',
      'templating    index.ts.hbs',
      'copying       setupTests.ts',
      'Installing:',
      `moving        plugins${sep}test-node`,
    ]);

    await expect(
      fs.readJson('/root/plugins/test-node/package.json'),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'backstage-plugin-test-node',
        description: 'Node.js library for the test plugin',
        private: true,
        version: '1.0.0',
      }),
    );

    expect(Task.forCommand).toHaveBeenCalledTimes(2);
    expect(Task.forCommand).toHaveBeenCalledWith('yarn install', {
      cwd: resolvePath('/root/plugins/test-node'),
      optional: true,
    });
    expect(Task.forCommand).toHaveBeenCalledWith('yarn lint --fix', {
      cwd: resolvePath('/root/plugins/test-node'),
      optional: true,
    });
  });
});
