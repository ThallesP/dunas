import { Module } from "@nestjs/common"
import { DunasModule } from "dunasjs/nestjs"
import { billing } from "./billing.ts"

@Module({ imports: [DunasModule.forRoot({ billing })] })
export class AppModule {}
