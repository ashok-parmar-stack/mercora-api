import { Injectable } from '@nestjs/common';
import { LgdStateSource, LgdStateRecord } from './lgd-state.source';
import { LgdDistrictSource, LgdDistrictRecord } from './lgd-district.source';
import { LgdSubDistrictSource, LgdSubDistrictRecord } from './lgd-sub-district.source';

export * from './lgd-state.source';
export * from './lgd-district.source';
export * from './lgd-sub-district.source';

@Injectable()
export class LGDSource {
  readonly sourceName = 'LGD';

  constructor(
    private readonly stateSource: LgdStateSource,
    private readonly districtSource: LgdDistrictSource,
    private readonly subDistrictSource: LgdSubDistrictSource,
  ) {}

  async fetchStates(): Promise<LgdStateRecord[]> {
    return this.stateSource.fetchStates();
  }

  async fetchDistricts(stateLgdCode?: string): Promise<LgdDistrictRecord[]> {
    return this.districtSource.fetchDistricts(stateLgdCode);
  }

  async fetchSubDistricts(districtLgdCode?: string): Promise<LgdSubDistrictRecord[]> {
    return this.subDistrictSource.fetchSubDistricts(districtLgdCode);
  }
}
