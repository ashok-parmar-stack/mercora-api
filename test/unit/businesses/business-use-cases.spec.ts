/// <reference types="jest" />
import { ConflictException, ForbiddenException } from '@nestjs/common';
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
          slug: 'apex-steel',
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

      const result: any = await useCase.execute({
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

    it('BE-BUS-003: normalizes multiple role contacts and syncs primary phone', async () => {
      const repo: any = {
        findBySlug: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (entity) => entity),
      };
      const useCase = new CreateBusinessUseCase(repo);

      const result: any = await useCase.execute({
        name: 'Multi Contact Co',
        category: 'Machinery',
        city: 'Pune',
        state: 'Maharashtra',
        contacts: [
          { role: 'Owner', name: 'Asha', phone: '+91 90000 11111' },
          { role: 'Seller', name: 'Raj', phone: '+91 90000 22222', isPrimary: true },
          { role: 'Marketing', phone: '+91 90000 33333' },
          { role: 'IT', phone: '+91 90000 44444' },
        ],
      } as any);

      expect(result.contacts).toHaveLength(4);
      expect(result.phone).toBe('+91 90000 22222');
      expect(result.contacts[1].isPrimary).toBe(true);
    });
  });

  describe('CustomerBusinessController', () => {
    it('BE-BUS-002: blocks customer from updating another user business (ForbiddenException) and allows owner', async () => {
      const createUseCase: any = { execute: jest.fn() };
      const updateUseCase: any = { execute: jest.fn().mockResolvedValue({ id: 'biz-1' }) };
      const repo: any = {
        findById: jest.fn().mockResolvedValue({ id: 'biz-1', email: 'owner@company.com' }),
      };
      const controller = new CustomerBusinessController(createUseCase, updateUseCase, repo);

      await expect(
        controller.update('biz-1', { name: 'Hijack' } as any, {
          user: { userId: 'u-2', email: 'other@company.com', role: 'CUSTOMER' },
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(updateUseCase.execute).not.toHaveBeenCalled();

      await controller.update('biz-1', { name: 'Updated' } as any, {
        user: { userId: 'u-1', email: 'owner@company.com', role: 'CUSTOMER' },
      });
      expect(updateUseCase.execute).toHaveBeenCalledWith('biz-1', { name: 'Updated' });
    });
  });
});
