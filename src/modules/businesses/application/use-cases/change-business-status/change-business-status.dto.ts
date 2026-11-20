import { IsEnum, IsNotEmpty } from "class-validator";
import { VerificationStatus } from "../../../domain/enums/verification-status.enum";

export class ChangeBusinessStatusDto {
  @IsNotEmpty()
  @IsEnum(VerificationStatus)
  status: VerificationStatus;
}
