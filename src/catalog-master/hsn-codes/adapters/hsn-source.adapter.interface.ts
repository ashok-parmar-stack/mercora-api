export interface RawHsnRecord {
  code: string;
  name: string;
  description?: string;
  level: 'CHAPTER_2' | 'HEADING_4' | 'SUBHEADING_6' | 'TARIFF_8';
  unit?: string;
  source: string;
  sourceCode?: string;
  sourceRecordId?: string;
  sourceUpdatedAt?: Date;
}

export interface IHsnSourceAdapter {
  readonly sourceName: string;
  fetchOfficialRecords(): Promise<RawHsnRecord[]>;
}
