import { Injectable } from '@nestjs/common';
import {
  ILgdSourceAdapter,
  RawLgdState,
  RawLgdDistrict,
  RawLgdSubDistrict,
} from './lgd-source.adapter.interface';
import { LGDSource } from '../../sources/lgd/lgd.source';

@Injectable()
export class LgdSourceAdapter implements ILgdSourceAdapter {
  readonly sourceName = 'LGD';

  constructor(private readonly lgdSource: LGDSource) {}

  async fetchOfficialStates(): Promise<RawLgdState[]> {
    const states = await this.lgdSource.fetchStates();
    return states.map((s) => ({
      name: s.name,
      localName: s.localName,
      code: s.code,
      lgdCode: s.lgdCode,
      censusCode: s.censusCode,
      type: s.type,
    }));
  }

  async fetchOfficialDistricts(stateCode?: string): Promise<RawLgdDistrict[]> {
    const districts = await this.lgdSource.fetchDistricts(stateCode);
    return districts.map((d) => ({
      name: d.name,
      localName: d.localName,
      code: d.code,
      stateCode: d.stateLgdCode || d.stateCode || '',
      lgdCode: d.lgdCode,
      censusCode: d.censusCode,
      headquarters: d.headquarters,
    }));
  }

  async fetchOfficialSubDistricts(districtCode?: string): Promise<RawLgdSubDistrict[]> {
    const subDistricts = await this.lgdSource.fetchSubDistricts(districtCode);
    return subDistricts.map((sd) => ({
      name: sd.name,
      localName: sd.localName,
      code: sd.code,
      districtCode: sd.districtLgdCode || '',
      stateCode: sd.stateLgdCode,
      censusCode: sd.censusCode,
    }));
  }
}
