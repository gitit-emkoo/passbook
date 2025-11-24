import { Body, Controller, Get, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/students')
export class StudentsController {
	constructor(private readonly studentsService: StudentsService) {}

	@Post()
	async create(@Req() req: Request, @Body() dto: CreateStudentDto) {
		const user = req.user as any;
		return this.studentsService.create(user.id ?? user.sub, dto);
	}

	@Get()
	async list(@Query('search') search: string | undefined, @Query('filter') filter: string | undefined, @Req() req: Request) {
		const user = req.user as any;
		const userId = user.id ?? user.sub;
		console.log(`[Students] GET /api/v1/students userId=${userId} search=${search || ''} filter=${filter || ''}`);
		const result = await this.studentsService.list({ search, filter, userId });
		console.log(`[Students] list result count=${result.length}`);
		return result;
	}

	@Get(':id')
	async detail(@Param('id') id: string, @Req() req: Request) {
		const user = req.user as any;
		return this.studentsService.detail(Number(id), (user.id ?? user.sub));
	}

	@Patch(':id')
	async update(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: Request,
		@Body() dto: UpdateStudentDto,
	) {
		const user = req.user as any;
		return this.studentsService.update((user.id ?? user.sub), id, dto);
	}

	@Patch(':id/active')
	async setActive(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: Request,
		@Query('is_active', ParseBoolPipe) isActive: boolean,
	) {
		const user = req.user as any;
		return this.studentsService.toggleActive((user.id ?? user.sub), id, isActive);
	}
}
