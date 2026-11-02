import { Module } from "@nestjs/common"
import { DunasModule } from "dunas/nestjs"
import { billing } from "./billing.ts"

@Module({ imports: [DunasModule.forRoot({ billing })] })
export class AppModule {}
