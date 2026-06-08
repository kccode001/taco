import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../database/entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        territory_id: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * `/users/me` payload — same as findOne but eagerly joins territory + the
   * Taro region (for taro_agent users) so the FE doesn't need a second
   * roundtrip to resolve names/codes.
   */
  async findMe(id: string): Promise<{
    id: string;
    email: string;
    name: string;
    role: string;
    phone: string | null;
    territory_id: string | null;
    territory: { id: string; name: string; code: string } | null;
    taro_region_id: string | null;
    taro_region: { id: string; name: string; code: string; display_path: string } | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { territory: true, taro_region: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone ?? null,
      territory_id: user.territory_id ?? null,
      territory: user.territory
        ? { id: user.territory.id, name: user.territory.name, code: user.territory.code }
        : null,
      taro_region_id: user.taro_region_id ?? null,
      taro_region: user.taro_region
        ? {
            id: user.taro_region.id,
            name: user.taro_region.name,
            code: user.taro_region.code,
            display_path: user.taro_region.display_path,
          }
        : null,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });
    if (existing) {
      throw new ConflictException(`Email ${createUserDto.email} is already in use`);
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    const user = this.usersRepository.create({
      email: createUserDto.email,
      password_hash: passwordHash,
      name: createUserDto.name,
      role: createUserDto.role,
      territory_id: createUserDto.territory_id,
    });

    const saved = await this.usersRepository.save(user);
    const { password_hash, refresh_token_hash, ...result } = saved;
    return result as User;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existing) {
        throw new ConflictException(`Email ${updateUserDto.email} is already in use`);
      }
    }

    const updateData: Partial<User> = {};

    if (updateUserDto.email) updateData.email = updateUserDto.email;
    if (updateUserDto.name) updateData.name = updateUserDto.name;
    if (updateUserDto.role) updateData.role = updateUserDto.role;
    if (updateUserDto.territory_id !== undefined) updateData.territory_id = updateUserDto.territory_id;
    if (updateUserDto.password) {
      updateData.password_hash = await bcrypt.hash(updateUserDto.password, 10);
    }

    await this.usersRepository.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.update(id, { is_active: false });
  }

  async updateRefreshToken(id: string, tokenHash: string | null): Promise<void> {
    await this.usersRepository.update(id, { refresh_token_hash: tokenHash ?? undefined });
  }
}
