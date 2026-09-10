import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { LanguagesService } from './languages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('languages')
export class LanguagesController {
  constructor(private readonly languagesService: LanguagesService) {}

  @Get()
  findAll() {
    return this.languagesService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.languagesService.findByCode(code);
  }

  @Get(':languageId')
  findById(@Param('languageId', ParseUUIDPipe) languageId: string) {
    return this.languagesService.findById(languageId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateLanguageDto) {
    return this.languagesService.create(dto);
  }

  @Patch(':languageId')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('languageId', ParseUUIDPipe) languageId: string,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.languagesService.update(languageId, dto);
  }

  @Delete(':languageId')
  @UseGuards(JwtAuthGuard)
  remove(@Param('languageId', ParseUUIDPipe) languageId: string) {
    return this.languagesService.remove(languageId);
  }
}
