import { Controller } from "@nestjs/common";
import { PublicBusinessController } from "./controllers/public-business.controller";

@Controller("businesses")
export class BusinessesController extends PublicBusinessController {}
