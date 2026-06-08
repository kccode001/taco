import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../database/entities/user.entity';

/**
 * Default landing route per role. FE is free to override based on which login
 * page the user came from (e.g. the Taro admin login button → /taro/dashboard)
 * but Taro Sales Agents are pinned to the PWA shell unconditionally.
 */
function redirectForRole(role: string): string {
  if (role === UserRole.TARO_AGENT) return '/taro-app';
  return '/dashboard';
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<Omit<User, 'password_hash' | 'refresh_token_hash'> | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.is_active) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    const { password_hash, refresh_token_hash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user.id);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      redirect_to: redirectForRole(user.role),
    };
  }

  async refresh(refreshToken: string, userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!user.refresh_token_hash) {
      throw new UnauthorizedException('No active refresh token');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refresh_token_hash,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    if (payload.type !== 'refresh' || payload.sub !== userId) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const newAccessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken(user.id);

    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, newRefreshTokenHash);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      redirect_to: redirectForRole(user.role),
    };
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  private generateAccessToken(user: any): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
  }

  private generateRefreshToken(userId: string): string {
    const payload = {
      sub: userId,
      type: 'refresh',
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
  }
}
