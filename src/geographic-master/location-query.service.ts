import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from './countries/entities/country.entity';
import { StateEntity } from './states/entities/state.entity';
import { DistrictEntity } from './districts/entities/district.entity';
import { SubDistrictEntity } from './sub-districts/entities/sub-district.entity';
import { LocationSyncService } from './location-sync.service';

export interface LocationCityDto {
  id: string;
  name: string;
  slug: string;
  code?: string;
  state: string;
  stateName: string;
  stateId?: string;
  locationType: string;
  businessCount: number;
}

const BASELINE_HUBS = [
  { name: 'Ahmedabad', code: 'AMD', state: 'Gujarat', locationType: 'Industrial Machinery & Engineering Hub' },
  { name: 'Surat', code: 'ST', state: 'Gujarat', locationType: 'Textiles, Diamonds & Apparel Hub' },
  { name: 'Vadodara', code: 'BRC', state: 'Gujarat', locationType: 'Pharmaceuticals, Chemicals & Power Hub' },
  { name: 'Morbi', code: 'MRB', state: 'Gujarat', locationType: 'Ceramics, Tiles & Sanitaryware Capital' },
  { name: 'Rajkot', code: 'RJT', state: 'Gujarat', locationType: 'Auto Components, Casting & Forging Hub' },
  { name: 'Gandhinagar', code: 'GND', state: 'Gujarat', locationType: 'Electronics, IT & Finance Hub' },
  { name: 'Bharuch', code: 'BH', state: 'Gujarat', locationType: 'Chemicals, Petrochemicals & Dyes' },
  { name: 'Ankleshwar', code: 'ANK', state: 'Gujarat', locationType: 'Chemical & Bulk Drug Industrial Estate' },
  { name: 'Vapi', code: 'VP', state: 'Gujarat', locationType: 'Chemical, Paper & Plastics Hub' },
  { name: 'Jamnagar', code: 'JAM', state: 'Gujarat', locationType: 'Brass Components & Refining' },
  { name: 'Bhavnagar', code: 'BHV', state: 'Gujarat', locationType: 'Ship Recycling & Plastic Machinery' },
  { name: 'Pune', code: 'PN', state: 'Maharashtra', locationType: 'Automobile & Heavy Engineering Corridor' },
  { name: 'Mumbai', code: 'BOM', state: 'Maharashtra', locationType: 'Commercial & Financial Headquarters' },
  { name: 'Bengaluru', code: 'BLR', state: 'Karnataka', locationType: 'Aerospace, Technology & Precision Engineering' },
  { name: 'Chennai', code: 'MAA', state: 'Tamil Nadu', locationType: 'Automotive & Hardware Manufacturing' },
  { name: 'Coimbatore', code: 'CJB', state: 'Tamil Nadu', locationType: 'Textile Machinery & Pumps Manufacturing' },
  { name: 'Ludhiana', code: 'LDH', state: 'Punjab', locationType: 'Bicycle, Machine Tools & Hosiery' },
  { name: 'Indore', code: 'IDR', state: 'Madhya Pradesh', locationType: 'Pharma & Food Processing Corridor' },
  { name: 'Jaipur', code: 'JAI', state: 'Rajasthan', locationType: 'Handicrafts, Gems & Minerals' },
  { name: 'Hyderabad', code: 'HYD', state: 'Telangana', locationType: 'Pharmaceuticals & Biotechnology' },
];

@Injectable()
export class LocationQueryService {
  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(SubDistrictEntity)
    private readonly subDistrictRepo: Repository<SubDistrictEntity>,
    private readonly locationSyncService: LocationSyncService,
  ) {}

  async getCountries() {
    let countries = await this.countryRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      take: 300,
    });

    if (countries.length === 0) {
      const seeded = await this.locationSyncService.ensureIndiaCountry();
      countries = [seeded];
    }

    return countries.map((c) => ({
      id: c.id,
      name: c.name,
      isoCode: c.iso2Code,
      iso2Code: c.iso2Code,
      phoneCode: c.phoneCode,
      currencyCode: c.currencyCode,
    }));
  }

  async getStates(countryId?: string, search?: string) {
    const qb = this.stateRepo
      .createQueryBuilder('state')
      .where('state.isActive = :isActive', { isActive: true });

    if (countryId) {
      qb.andWhere('state.countryId = :countryId', { countryId });
    }
    if (search && search.trim().length >= 2) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(state.name) LIKE :term OR LOWER(state.code) LIKE :term)', { term });
    }

    const states = await qb.orderBy('state.name', 'ASC').take(200).getMany();
    return states.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      lgdCode: s.lgdCode,
      countryId: s.countryId,
      type: s.type,
    }));
  }

  async getDistricts(stateId?: string, search?: string) {
    const qb = this.districtRepo
      .createQueryBuilder('district')
      .where('district.isActive = :isActive', { isActive: true });

    if (stateId) {
      qb.andWhere('district.stateId = :stateId', { stateId });
    }
    if (search && search.trim().length >= 2) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(district.name) LIKE :term OR LOWER(district.code) LIKE :term)', { term });
    }

    const districts = await qb.orderBy('district.name', 'ASC').take(500).getMany();
    return districts.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      lgdCode: d.lgdCode,
      stateId: d.stateId,
    }));
  }

  async getSubDistricts(districtId?: string, search?: string) {
    const qb = this.subDistrictRepo
      .createQueryBuilder('sd')
      .where('sd.isActive = :isActive', { isActive: true });

    if (districtId) {
      qb.andWhere('sd.districtId = :districtId', { districtId });
    }
    if (search && search.trim().length >= 2) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(sd.name) LIKE :term OR LOWER(sd.code) LIKE :term)', { term });
    }

    const subDistricts = await qb.orderBy('sd.name', 'ASC').take(500).getMany();
    return subDistricts.map((sd) => ({
      id: sd.id,
      name: sd.name,
      code: sd.code,
      lgdCode: sd.lgdCode,
      districtId: sd.districtId,
    }));
  }

  async getCities(stateId?: string, search?: string): Promise<LocationCityDto[]> {
    const cityMap = new Map<string, LocationCityDto>();

    for (const hub of BASELINE_HUBS) {
      const key = hub.name.trim().toLowerCase();
      cityMap.set(key, {
        id: key,
        name: hub.name,
        slug: hub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        code: hub.code,
        state: hub.state,
        stateName: hub.state,
        locationType: hub.locationType,
        businessCount: 0,
      });
    }

    try {
      const rows = await this.districtRepo.query(
        `SELECT city, state, COUNT(*)::int as count
         FROM directory_businesses
         WHERE city IS NOT NULL AND TRIM(city) != ''
         GROUP BY city, state
         ORDER BY count DESC`,
      );
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const rawCity = String(r.city || '').trim();
          if (!rawCity) continue;
          const key = rawCity.toLowerCase();
          const rawState = String(r.state || 'Gujarat').trim();
          const count = Number(r.count) || 0;
          const existing = cityMap.get(key);
          if (existing) {
            existing.businessCount = count;
            if (rawState) {
              existing.state = rawState;
              existing.stateName = rawState;
            }
          } else {
            cityMap.set(key, {
              id: key,
              name: rawCity,
              slug: rawCity.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              code: rawCity.slice(0, 3).toUpperCase(),
              state: rawState,
              stateName: rawState,
              locationType: 'Industrial Business Cluster',
              businessCount: count,
            });
          }
        }
      }
    } catch {
      // Directory count query fallback
    }

    try {
      const qb = this.districtRepo
        .createQueryBuilder('district')
        .leftJoinAndSelect('district.state', 'state')
        .where('district.isActive = :isActive', { isActive: true });
      if (stateId) qb.andWhere('district.stateId = :stateId', { stateId });

      const districts = await qb.take(500).getMany();
      for (const d of districts) {
        const key = d.name.trim().toLowerCase();
        const existing = cityMap.get(key);
        if (existing) {
          existing.id = d.id;
          existing.code = d.code || existing.code;
          existing.stateId = d.stateId;
          if (d.state?.name) {
            existing.state = d.state.name;
            existing.stateName = d.state.name;
          }
        } else {
          cityMap.set(key, {
            id: d.id,
            name: d.name,
            slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            code: d.code,
            state: d.state?.name || 'Gujarat',
            stateName: d.state?.name || 'Gujarat',
            stateId: d.stateId,
            locationType: 'Commercial District',
            businessCount: 0,
          });
        }
      }
    } catch {
      // District query fallback
    }

    let list = Array.from(cityMap.values());
    if (stateId) list = list.filter((c) => c.stateId === stateId);
    if (search && search.trim().length > 0) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.state.toLowerCase().includes(term) ||
          (c.code && c.code.toLowerCase().includes(term)),
      );
    }

    list.sort((a, b) =>
      b.businessCount !== a.businessCount
        ? b.businessCount - a.businessCount
        : a.name.localeCompare(b.name),
    );
    return list;
  }
}
