import { ConflictException } from '@nestjs/common';
import { CreateBusinessUseCase } from '../../../src/modules/businesses/application/use-cases/create-business/create-business.use-case';
import { CustomerBusinessController } from '../../../src/modules/businesses/presentation/controllers/customer-business.controller';

describe('Businesses Unit Tests', () => {
  describe('CreateBusinessUseCase', () => {
    it('BE-BUS-001: throws ConflictException when slug already exists', async () => {
      const repo: any = {
        findBySlug: jest.fn().mockResolvedValue({ id: 'existing-1' }),
        save: jest.fn(),
      };
      const useCase = new CreateBusinessUseCase(repo);

      await expect(
        useCase.execute({
          name: 'Apex Steel',
          category: 'Metals',
          city: 'Surat',
          state: 'Gujarat',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('BE-BUS-001: generates normalized slug and saves BusinessEntity', async () => {
      const repo: any = {
        findBySlug: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (entity) => entity),
      };
      const useCase = new CreateBusinessUseCase(repo);

      const result = await useCase.execute({
        name: 'Apex Steel & Alloys!',
        category: 'Metals',
        city: 'Surat',
        state: 'Gujarat',
      } as any);

      expect(repo.findBySlug).toHaveBeenCalledWith('apex-steel-alloys');
      expect(repo.save).toHaveBeenCalled();
      expect(result.slug).toBe('apex-steel-alloys');
      expect(result.name).toBe('Apex Steel & Alloys!');
    });
  });

  describe('CustomerBusinessController', () => {
    it('BE-BUS-002: delegates update without passing authenticated userId (documents IDOR gap BUG-001)', async () => {
      const createUseCase: any = { execute: jest.fn() };
      const updateUseCase: any = { execute: jest.fn().mockResolvedValue({ id: 'biz-1' }) };
      const controller = new CustomerBusinessController(createUseCase, updateUseCase);

      // CustomerBusinessController.update only accepts (id, dto) and does not check ownership
      expect(controller.update.length).toBe(2);
      await controller.update('biz-1', { name: 'Updated' } as any);
      expect(updateUseCase.execute).toHaveBeenCalledWith('biz-1', { name: 'Updated' });
    });
  });
});
