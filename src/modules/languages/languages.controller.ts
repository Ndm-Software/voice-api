import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { LanguagesService } from './languages.service';

@Controller('languages')
export class LanguagesController {
  constructor(
    private readonly languagesService: LanguagesService,
  ) {}

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
  create(@Body() dto: CreateLanguageDto) {
    return this.languagesService.create(dto);
  }

  @Patch(':languageId')
  update(
    @Param('languageId', ParseUUIDPipe) languageId: string,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.languagesService.update(
      languageId,
      dto,
    );
  }

  @Delete(':languageId')
  remove(@Param('languageId', ParseUUIDPipe) languageId: string) {
    return this.languagesService.remove(languageId);
  }
}