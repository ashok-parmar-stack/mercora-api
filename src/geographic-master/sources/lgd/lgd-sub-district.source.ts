import { Injectable } from '@nestjs/common';
import { MercoraLogger } from '../../../common/logger';
import { LgdClient } from './lgd-client';

export interface LgdSubDistrictRecord {
  lgdCode: string;
  districtLgdCode: string;
  stateLgdCode?: string;
  name: string;
  localName?: string;
  code: string;
  censusCode?: string;
}

@Injectable()
export class LgdSubDistrictSource {
  private readonly logger = new MercoraLogger(LgdSubDistrictSource.name);

  /**
   * Fetch official Sub-Districts (Talukas / Tehsils) dynamically from Government LGD directory API using Axios
   * Source: https://lgdirectory.gov.in/
   */
  async fetchSubDistricts(districtLgdCode?: string): Promise<LgdSubDistrictRecord[]> {
    this.logger.log(`Fetching official Sub-Districts dynamically from LGD Directory API via Axios (filter: ${districtLgdCode || 'All'})...`);

    try {
      const distCodes: string[] = [];

      if (districtLgdCode && !isNaN(Number(districtLgdCode))) {
        distCodes.push(districtLgdCode.trim());
      }

      const allSubDistricts: LgdSubDistrictRecord[] = [];

      for (const dCode of distCodes) {
        try {
          const rawRecords = await LgdClient.executeDwrCall<any>(
            'lgdDwrSubDistrictService',
            'getSubDistrictList',
            [Number(dCode)],
          );

          if (rawRecords && rawRecords.length > 0) {
            const mapped = rawRecords
              .map((r: any) => {
                const rawLgd = String(r.subdistrictCode || r.tlc || r.sub_district_code || r.lgdCode || '');
                const rawName = (r.subdistrictNameEnglish || r.sub_district_name_english || r.subdistrictName || r.name || '').trim();
                const rawLocal = (r.subdistrictNameLocal || r.sub_district_name_local || '').trim() || undefined;
                const rawCode = r.subdistrictCodeISO || (rawLgd ? `SD-${rawLgd}` : rawName.toUpperCase());

                return {
                  lgdCode: rawLgd,
                  districtLgdCode: dCode,
                  stateLgdCode: r.stateCode ? String(r.stateCode) : undefined,
                  name: rawName,
                  localName: rawLocal,
                  code: rawCode,
                  censusCode: r.census2011Code ? String(r.census2011Code) : r.census_2011_code ? String(r.census_2011_code) : undefined,
                };
              })
              .filter((sd: LgdSubDistrictRecord) => Boolean(sd.name && sd.lgdCode));

            allSubDistricts.push(...mapped);
          }
        } catch (distErr: any) {
          this.logger.warn(`Failed fetching sub-districts for district ${dCode}: ${distErr?.message}`);
        }
      }

      this.logger.log(`Retrieved ${allSubDistricts.length} official sub-districts dynamically from LGD Directory API.`);
      return allSubDistricts;
    } catch (err: any) {
      this.logger.warn(`LGD Sub-District API call failed: ${err?.message}`);
      return [];
    }
  }
}
