import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module.ts"
import { billing } from "./billing.ts"

await billing.migrate()

const app = await NestFactory.create(AppModule)
await app.listen(3000)
