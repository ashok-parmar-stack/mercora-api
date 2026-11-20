export interface RawLgdState {
  name: string;
  localName?: string;
  code: string; // e.g. 'IN-GJ' or 'GJ'
  lgdCode?: string;
  censusCode?: string;
  type: 'STATE' | 'UNION_TERRITORY';
}

export interface RawLgdDistrict {
  name: string;
  localName?: string;
  code: string; // e.g. 'IN-GJ-MB'
  stateCode: string; // e.g. 'IN-GJ'
  lgdCode?: string;
  censusCode?: string;
  headquarters?: string;
}

export interface RawLgdSubDistrict {
  name: string;
  localName?: string;
  code: string;
  districtCode: string;
  stateCode?: string;
  censusCode?: string;
}

export interface RawIndiaPostRecord {
  pincode: string;
  officeName: string;
  officeType?: string; // 'HO' | 'SO' | 'BO'
  deliveryStatus?: string; // 'Delivery' | 'Non-Delivery'
  division?: string;
  districtName?: string;
  stateName?: string;
}

export interface ILgdSourceAdapter {
  readonly sourceName: string;
  fetchOfficialStates(): Promise<RawLgdState[]>;
  fetchOfficialDistricts(stateCode?: string): Promise<RawLgdDistrict[]>;
  fetchOfficialSubDistricts(districtCode?: string): Promise<RawLgdSubDistrict[]>;
}

export interface IIndiaPostSourceAdapter {
  readonly sourceName: string;
  fetchPostalRecords(pincode: string): Promise<RawIndiaPostRecord[]>;
}
