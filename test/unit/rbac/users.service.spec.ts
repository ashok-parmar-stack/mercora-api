import { UsersService } from '../../../src/modules/users/users.service';

describe('UsersService (Unit)', () => {
  const createSut = () => {
    const findService: any = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: 'u-1' }),
      getPermissionPanel: jest.fn().mockResolvedValue({ overrides: [] }),
      checkPermission: jest.fn().mockResolvedValue({ allowed: true }),
    };
    const createService: any = {
      create: jest.fn().mockResolvedValue({ id: 'u-2' }),
    };
    const updateService: any = {
      update: jest.fn().mockResolvedValue({ id: 'u-1', name: 'Updated' }),
      assignRole: jest.fn().mockResolvedValue({ id: 'u-1' }),
      setUserPermissions: jest.fn().mockResolvedValue({ updated: true }),
      addUserPermission: jest.fn().mockResolvedValue({ added: true }),
      removeUserPermissions: jest.fn().mockResolvedValue({ removed: true }),
    };
    const deleteService: any = {
      remove: jest.fn().mockResolvedValue({ deleted: true }),
      restore: jest.fn().mockResolvedValue({ restored: true }),
    };

    const service = new UsersService(findService, createService, updateService, deleteService);
    return { service, findService, createService, updateService, deleteService };
  };

  it('BE-USR-001: delegates find, create, update, role/permission, and delete/restore calls', async () => {
    const { service, findService, createService, updateService, deleteService } = createSut();

    await service.findAll({ page: 1 });
    expect(findService.findAll).toHaveBeenCalledWith({ page: 1 });

    await service.findOne('u-1');
    expect(findService.findOne).toHaveBeenCalledWith('u-1');

    await service.create({ email: 'a@b.com' } as any, 'actor-1');
    expect(createService.create).toHaveBeenCalledWith({ email: 'a@b.com' }, 'actor-1');

    await service.update('u-1', { name: 'New' } as any, 'actor-1');
    expect(updateService.update).toHaveBeenCalledWith('u-1', { name: 'New' }, 'actor-1');

    await service.assignRole('u-1', { roleId: 2 } as any, 'actor-1');
    expect(updateService.assignRole).toHaveBeenCalledWith('u-1', { roleId: 2 }, 'actor-1');

    await service.remove('u-1', { mode: 'SOFT' as any });
    expect(deleteService.remove).toHaveBeenCalledWith('u-1', { mode: 'SOFT' });

    await service.restore('u-1', 'actor-1');
    expect(deleteService.restore).toHaveBeenCalledWith('u-1', 'actor-1');
  });
});
