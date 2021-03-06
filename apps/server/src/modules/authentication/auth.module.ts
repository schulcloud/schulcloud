import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategy/jwt.strategy';
import { jwtConstants } from './constants';
import { UserModule } from '../user';
// import { AuthController } from './controller/auth.controller';
// import { LocalStrategy } from './strategy/local.strategy';

@Module({
	imports: [PassportModule, JwtModule.register(jwtConstants), UserModule],
	providers: [JwtStrategy],
	exports: [],
	controllers: [
		/* AuthController */
	],
})
export class AuthModule {}
