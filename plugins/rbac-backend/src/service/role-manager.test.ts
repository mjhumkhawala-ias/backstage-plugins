import { CatalogApi } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';

import { Logger } from 'winston';

import { BackstageRoleManager } from './role-manager';

describe('BackstageRoleManager', () => {
  const catalogApiMock: any = {
    getEntities: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ items: [] })),
  };

  const loggerMock: any = {
    warn: jest.fn().mockImplementation(),
    debug: jest.fn().mockImplementation(),
  };

  const roleManager = new BackstageRoleManager(
    catalogApiMock as CatalogApi,
    loggerMock as Logger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('unimplemented methods', () => {
    it('should throw an error for addLink', async () => {
      await expect(
        roleManager.addLink('user:default/role1', 'user:default/role2'),
      ).rejects.toThrow('Method "addLink" not implemented.');
    });

    it('should throw an error for deleteLink', async () => {
      await expect(
        roleManager.deleteLink('user:default/role1', 'user:default/role2'),
      ).rejects.toThrow('Method "deleteLink" not implemented.');
    });

    it('should throw an error for syncedHasLink', () => {
      expect(() =>
        roleManager.syncedHasLink!('user:default/role1', 'user:default/role2'),
      ).toThrow('Method "syncedHasLink" not implemented.');
    });

    it('should throw an error for getRoles', async () => {
      await expect(roleManager.getRoles('name')).rejects.toThrow(
        'Method "getRoles" not implemented.',
      );
    });

    it('should throw an error for getUsers', async () => {
      await expect(roleManager.getUsers('name')).rejects.toThrow(
        'Method "getUsers" not implemented.',
      );
    });
  });

  describe('hasLink tests', () => {
    it('should throw an error for unsupported domain', async () => {
      await expect(
        roleManager.hasLink(
          'user:default/mike',
          'group:default/somegroup',
          'someDomain',
        ),
      ).rejects.toThrow('domain argument is not supported.');
    });

    it('should return true for hasLink when names are the same', async () => {
      const result = await roleManager.hasLink(
        'user:default/mike',
        'user:default/mike',
      );
      expect(result).toBe(true);
    });

    it('should return false for hasLink when name2 has a user kind', async () => {
      const result = await roleManager.hasLink(
        'user:default/mike',
        'user:default/some-user',
      );
      expect(result).toBe(false);
    });

    // user:default/mike should not inherits from group:default/somegroup
    //
    //     Hierarchy:
    //
    // user:default/mike -> user without group
    //
    it('should return false for hasLink when user without group', async () => {
      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/somegroup',
      );
      expect(catalogApiMock.getEntities).toHaveBeenCalledWith({
        filter: {
          kind: 'Group',
          'relations.hasMember': ['user:default/mike'],
        },
        fields: [
          'metadata.name',
          'kind',
          'metadata.namespace',
          'spec.parent',
          'spec.children',
        ],
      });
      expect(result).toBeFalsy();
    });

    // user:default/mike should inherits from group:default/somegroup
    //
    //     Hierarchy:
    //
    // group:default/somegroup
    //          |
    //  user:default/mike
    //
    it('should return true for hasLink when user:default/mike inherits from group:default/somegroup', async () => {
      const entityMock = createGroupEntity('somegroup', undefined, []);
      catalogApiMock.getEntities.mockReturnValue({ items: [entityMock] });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/somegroup',
      );
      expect(result).toBeTruthy();
    });

    // user:default/mike should not inherits from group:default/somegroup
    //
    //     Hierarchy:
    //
    // group:default/not-matched-group
    //         |
    // user:default/mike
    //
    it('should return false for hasLink when user:default/mike does not inherits group:default/somegroup', async () => {
      const entityMock = createGroupEntity('not-matched-group', undefined, []);
      catalogApiMock.getEntities.mockReturnValue({ items: [entityMock] });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/somegroup',
      );
      expect(result).toBeFalsy();
    });

    // user:default/mike should inherits from group:default/team-a
    //
    //     Hierarchy:
    //
    // group:default/team-a
    //       |
    // group:default/team-b
    //       |
    // user:default/mike
    //
    it('should return true for hasLink, when user:default/mike inherits from group:default/team-a', async () => {
      const groupMock = createGroupEntity('team-b', 'team-a', []);
      const groupParentMock = createGroupEntity('team-a', undefined, [
        'team-b',
      ]);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        if (hasParent && hasParent[0] === 'group:default/team-b') {
          return { items: [groupParentMock] };
        }
        return { items: [] };
      });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeTruthy();
    });

    // user:default/mike should inherits from group:default/team-b.
    //
    //     Hierarchy:
    //
    //            |---------group:default/team-a---------|
    //            |                  |                   |
    // user:default/team-c group:default/team-b   group:default/team-d
    //            |                  |                   |
    //   user:default/tom       user:default/mike    user:default:john
    //
    it('should return true for hasLink, when user:default/mike inherits from group:default/team-b', async () => {
      const groupAMock = createGroupEntity('team-a', undefined, [
        'team-b',
        'team-c',
        'team-d',
      ]);
      const groupBMock = createGroupEntity('team-b', 'team-a', []);
      const groupCMock = createGroupEntity('team-c', 'team-a', []);
      const groupDMock = createGroupEntity('team-d', 'team-a', []);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupBMock] };
        }
        if (hasMember && hasMember[0] === 'user:default/tom') {
          return { items: [groupCMock] };
        }
        if (hasMember && hasMember[0] === 'user:default/john') {
          return { items: [groupDMock] };
        }

        const hasParent = arg.filter['relations.parentOf'];
        if (hasParent && hasParent[0] === 'group:default/team-b') {
          return { items: [groupAMock] };
        }
        if (hasParent && hasParent[0] === 'group:default/team-c') {
          return { items: [groupAMock] };
        }
        if (hasParent && hasParent[0] === 'group:default/team-d') {
          return { items: [groupAMock] };
        }
        return { items: [] };
      });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeTruthy();
    });

    // user:default/mike should not inherits from group:default/team-c
    //
    //     Hierarchy:
    //
    // group:default/team-a
    //       |
    // group:default/team-b
    //       |
    // user:default/mike
    //
    it('should return false for hasLink, when user:default/mike does not inherits from group:default/team-c', async () => {
      const groupBMock = createGroupEntity('team-b', 'team-a', []);
      const groupAMock = createGroupEntity('team-a', undefined, ['team-b']);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupBMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        if (hasParent && hasParent[0] === 'group:default/team-b') {
          return { items: [groupAMock] };
        }
        return { items: [] };
      });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-c',
      );
      expect(result).toBeFalsy();
    });

    // user:default/mike should inherits from group:default/team-a
    //
    //     Hierarchy:
    //
    // group:default/team-a  group:default/team-b
    //       |                        |
    // group:default/team-c  group:default/team-d
    //                |              |
    //                user:default/mike
    //
    it('should return true for hasLink, when user:default/mike inherits group tree with group:default/team-a', async () => {
      const groupCMock = createGroupEntity('team-c', 'team-a', []);
      const groupDMock = createGroupEntity('team-d', 'team-b', []);
      const groupAMock = createGroupEntity('team-a', undefined, ['team-c']);
      const groupBMock = createGroupEntity('team-b', undefined, ['team-d']);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupCMock, groupDMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        if (
          hasParent &&
          hasParent[0] === 'group:default/team-c' &&
          hasParent[1] === 'group:default/team-d'
        ) {
          return { items: [groupAMock, groupBMock] };
        }
        return { items: [] };
      });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeTruthy();
    });

    // user:default/mike should not inherits from group:default/team-e
    //
    //     Hierarchy:
    //
    // group:default/team-a  group:default/team-b
    //       |                        |
    // group:default/team-c  group:default/team-d
    //                |              |
    //                user:default/mike
    //
    it('should return false for hasLink, when user:default/mike inherits from group:default/team-e', async () => {
      const groupCMock = createGroupEntity('team-c', 'team-a', []);
      const groupDMock = createGroupEntity('team-d', 'team-b', []);
      const groupAMock = createGroupEntity('team-a', undefined, ['team-c']);
      const groupBMock = createGroupEntity('team-b', undefined, ['team-d']);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupCMock, groupDMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        if (
          hasParent &&
          hasParent[0] === 'group:default/team-c' &&
          hasParent[1] === 'group:default/team-d'
        ) {
          return { items: [groupAMock, groupBMock] };
        }
        return { items: [] };
      });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-e',
      );
      expect(result).toBeFalsy();
    });

    // user:default/mike should inherits from group:default/team-b and group:default/team-a, but we have cycle dependency.
    // So return false on call hasLink.
    //
    //     Hierarchy:
    //
    // group:default/team-a
    //       ↓      ↑
    // group:default/team-b
    //          ↓
    // user:default/mike
    //
    it('should return false for hasLink, when user:default/mike inherits from group:default/team-a and group:default/team-b, but we have cycle dependency', async () => {
      const groupBMock = createGroupEntity('team-b', 'team-a', []);
      const groupAMock = createGroupEntity('team-a', 'team-b', ['team-b']);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupBMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        if (hasParent && hasParent[0] === 'group:default/team-b') {
          return { items: [groupAMock] };
        }
        return { items: [] };
      });

      let result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-b',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-b"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-b',
      );

      result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-b"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-a',
      );
    });

    // user:default/mike should inherits from group:default/team-a, group:default/team-b, group:default/team-c, but we have cycle dependency.
    // So return false on call hasLink.
    //
    //     Hierarchy:
    //
    // group:default/team-a
    //       ↓    ↑
    // group:default/team-b
    //          ↓
    // group:default/team-c
    //          ↓
    // user:default/mike
    //
    it('should return false for hasLink, when user:default/mike inherits from group:default/team-a, group:default/team-b, group:default/team-c, but we have cycle dependency', async () => {
      const groupAMock = createGroupEntity('team-a', 'team-b', ['team-b']);
      const groupBMock = createGroupEntity('team-b', 'team-a', []);
      const groupCMock = createGroupEntity('team-c', 'team-b', []);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupCMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        if (hasParent && hasParent[0] === 'group:default/team-c') {
          return { items: [groupBMock] };
        }
        if (hasParent && hasParent[0] === 'group:default/team-b') {
          return { items: [groupAMock] };
        }
        return { items: [] };
      });

      let result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-c',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-b"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-c',
      );

      result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-b',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-b"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-b',
      );

      result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-b"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-a',
      );
    });

    // user:default/mike should inherits from group:default/team-a, but we have cycle dependency: team-a -> team-c.
    // So return false on call hasLink.
    //
    //     Hierarchy:
    //
    // group:default/team-a  group:default/team-b
    //       ↓       ↑               ↓
    // group:default/team-c  group:default/team-d
    //               ↓               ↓
    //               user:default/mike
    //
    it('should return false for hasLink, when user:default/mike inherits group tree with group:default/team-a, but we cycle dependency', async () => {
      const groupCMock = createGroupEntity('team-c', 'team-a', ['mike']);
      const groupDMock = createGroupEntity('team-d', 'team-b', ['mike']);
      const groupAMock = createGroupEntity('team-a', 'team-c', ['team-c']);
      const groupBMock = createGroupEntity('team-b', undefined, ['team-d']);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];
        // first iteration
        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupCMock, groupDMock] };
        }
        const hasParent = arg.filter['relations.parentOf'];
        // second iteration
        if (
          hasParent &&
          hasParent[0] === 'group:default/team-c' &&
          hasParent[1] === 'group:default/team-d'
        ) {
          return { items: [groupAMock, groupBMock] };
        }
        return { items: [] };
      });

      const result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-c"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-a',
      );
    });

    // user:default/mike should inherits from group:default/team-a, but we have cycle dependency: team-a -> team-c.
    // So return false on call hasLink.
    //
    // user:default/tom should inherits from group:default/team-b. Cycle dependency in the neighbor subgraph, should
    // not affect evaluation user:default/tom inheritance.
    //
    //                 Hierarchy:
    //
    //              group:default/root
    //                ↓             ↓
    // group:default/team-a  group:default/team-b
    //       ↓       ↑               ↓
    // group:default/team-c  group:default/team-d
    //               ↓               ↓
    //   user:default/mike    user:default/tom
    //
    it('should return false for hasLink for user:default/mike and group:default/team-a(cycle dependency), but should be true for user:default/tom and group:default/team-b', async () => {
      const groupRootMock = createGroupEntity('root', undefined, [
        'team-a',
        'team-b',
      ]);
      const groupCMock = createGroupEntity('team-c', 'team-a', ['team-a']);
      const groupDMock = createGroupEntity('team-d', 'team-b', []);
      const groupAMock = createGroupEntity('team-a', 'root', ['team-c']);
      const groupBMock = createGroupEntity('team-b', 'root', ['team-d']);

      catalogApiMock.getEntities.mockImplementation((arg: any) => {
        const hasMember = arg.filter['relations.hasMember'];

        if (hasMember && hasMember[0] === 'user:default/mike') {
          return { items: [groupCMock] };
        }
        if (hasMember && hasMember[0] === 'user:default/tom') {
          return { items: [groupDMock] };
        }

        const hasParent = arg.filter['relations.parentOf'];

        if (hasParent && hasParent[0] === 'group:default/team-c') {
          return { items: [groupAMock] };
        }

        if (hasParent && hasParent[0] === 'group:default/team-d') {
          return { items: [groupBMock] };
        }

        if (
          (hasParent && hasParent[0] === 'group:default/team-b') ||
          hasParent[0] === 'group:default/team-a'
        ) {
          return { items: [groupRootMock] };
        }
        return { items: [] };
      });

      let result = await roleManager.hasLink(
        'user:default/mike',
        'group:default/team-a',
      );
      expect(result).toBeFalsy();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Detected cycle dependencies in the Group graph: [["group:default/team-a","group:default/team-c"]]. Admin/(catalog owner) have to fix it to make RBAC permission evaluation correct for group: group:default/team-a',
      );

      result = await roleManager.hasLink(
        'user:default/tom',
        'group:default/team-b',
      );
      expect(result).toBeTruthy();
    });
  });
  function createGroupEntity(
    name: string,
    parent?: string,
    children?: string[],
  ): Entity {
    const entity: Entity = {
      apiVersion: 'v1',
      kind: 'Group',
      metadata: {
        name,
        namespace: 'default',
      },
      spec: {},
    };

    if (children) {
      entity.spec!.children = children;
    }

    if (parent) {
      entity.spec!.parent = parent;
    }

    return entity;
  }
});
