import { Injectable } from '@nestjs/common';
import { MercoraLogger } from '../../../common/logger';
import { LgdClient } from './lgd-client';

export interface LgdDistrictRecord {
  lgdCode: string;
  stateLgdCode: string;
  name: string;
  localName?: string;
  code: string;
  stateCode?: string;
  censusCode?: string;
  headquarters?: string;
}

@Injectable()
export class LgdDistrictSource {
  private readonly logger = new MercoraLogger(LgdDistrictSource.name);

  /**
   * Fetch official Districts dynamically from Government LGD Directory API using Axios
   * Source: https://lgdirectory.gov.in/
   */
  async fetchDistricts(stateLgdCode?: string): Promise<LgdDistrictRecord[]> {
    this.logger.log(`Fetching official Districts dynamically from LGD Directory API via Axios (filter: ${stateLgdCode || 'All'})...`);

    try {
      const stateCodes: string[] = [];

      if (stateLgdCode && !isNaN(Number(stateLgdCode))) {
        stateCodes.push(stateLgdCode.trim());
      } else {
        // Fetch all states dynamically to retrieve district lists
        const states = await LgdClient.executeDwrCall<any>('lgdDwrStateService', 'getAllStates', []);
        for (const st of states) {
          if (st.stateCode) {
            stateCodes.push(String(st.stateCode));
          }
        }
      }

      const allDistricts: LgdDistrictRecord[] = [];

      for (const sCode of stateCodes) {
        try {
          const rawRecords = await LgdClient.executeDwrCall<any>(
            'lgdDwrDistrictService',
            'getDistrictList',
            [Number(sCode)],
          );

          if (rawRecords && rawRecords.length > 0) {
            const mapped = rawRecords
              .map((r: any) => {
                const rawLgd = String(r.districtCode || r.district_code || r.lgdCode || '');
                const rawName = (r.districtNameEnglish || r.district_name_english || r.districtName || r.name || '').trim();
                const rawLocal = (r.districtNameLocal || r.district_name_local || '').trim() || undefined;
                const rawCode = r.districtCodeISO || (rawLgd ? `DIST-${rawLgd}` : rawName.toUpperCase());

                return {
                  lgdCode: rawLgd,
                  stateLgdCode: sCode,
                  name: rawName,
                  localName: rawLocal,
                  code: rawCode,
                  censusCode: r.census2011Code ? String(r.census2011Code) : r.census_2011_code ? String(r.census_2011_code) : undefined,
                  headquarters: r.headquarters || r.districtHeadquarters,
                };
              })
              .filter((d: LgdDistrictRecord) => Boolean(d.name && d.lgdCode));

            allDistricts.push(...mapped);
          }
        } catch (stateErr: any) {
          this.logger.warn(`Failed fetching districts for state ${sCode}: ${stateErr?.message}`);
        }
      }

      this.logger.log(`Retrieved ${allDistricts.length} official districts dynamically from LGD Directory API.`);
      return allDistricts;
    } catch (err: any) {
      this.logger.warn(`LGD District API call failed: ${err?.message}`);
      return [];
    }
  }
}
