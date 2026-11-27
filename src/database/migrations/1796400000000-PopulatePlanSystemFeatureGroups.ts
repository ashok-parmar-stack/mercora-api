import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  INITIAL_SUBSCRIPTION_PLANS,
  buildSystemFeatureGroups,
} from '../../modules/subscriptions/subscription.constants';

export class PopulatePlanSystemFeatureGroups1796400000000 implements MigrationInterface {
  name = 'PopulatePlanSystemFeatureGroups1796400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const plan of INITIAL_SUBSCRIPTION_PLANS) {
      const groupsJson = JSON.stringify(
        buildSystemFeatureGroups(plan.limits, plan.durationDays),
      );
      const featuresJson = JSON.stringify(plan.features);

      await queryRunner.query(
        `
        UPDATE "subscription_plans"
        SET
          "name" = $2,
          "description" = $3,
          "original_price_minor" = COALESCE("original_price_minor", $4),
          "features" = $5::jsonb,
          "feature_groups" = CASE
            WHEN "feature_groups" = '[]'::jsonb OR "feature_groups" IS NULL
              THEN $6::jsonb
            ELSE "feature_groups"
          END
        WHERE "code" = $1
        `,
        [
          plan.code,
          plan.name,
          plan.description,
          (plan as any).originalPriceMinor ?? null,
          featuresJson,
          groupsJson,
        ],
      );
    }
  }

  public async down(): Promise<void> {
    // Non-destructive data enrichment migration
  }
}
