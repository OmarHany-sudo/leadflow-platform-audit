import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Connectors')
@Controller('connectors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ConnectorsController {
  constructor(private connectorsService: ConnectorsService) {}

  @Post('google-maps/search')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Search Google Maps for leads' })
  @ApiResponse({ status: 200, description: 'Search completed' })
  async searchGoogleMaps(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body('query') query: string,
    @Body('location') location: string,
  ) {
    const results = await this.connectorsService.searchGoogleMaps(query, location, organizationId, userId);
    return { count: results.length, results };
  }

  @Post('reddit/search')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Search Reddit for intent signals' })
  @ApiResponse({ status: 200, description: 'Search completed' })
  async searchReddit(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body('keywords') keywords: string[],
    @Body('subreddits') subreddits?: string[],
  ) {
    const results = await this.connectorsService.searchReddit(keywords, subreddits, organizationId, userId);
    return { count: results.length, results };
  }

  @Post('linkedin/search')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Search LinkedIn for companies' })
  @ApiResponse({ status: 200, description: 'Search completed' })
  async searchLinkedIn(
    @Body('companyName') companyName: string,
    @Body('industry') industry?: string,
    @Body('location') location?: string,
  ) {
    return this.connectorsService.searchLinkedIn(companyName, industry, location);
  }

  @Post('save')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Save connector results as leads' })
  @ApiResponse({ status: 201, description: 'Leads saved' })
  async saveLeads(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body('leads') leads: any[],
  ) {
    return this.connectorsService.saveLeads(leads, organizationId, userId);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get available connectors' })
  @ApiResponse({ status: 200, description: 'Connectors list' })
  async getAvailableConnectors() {
    return [
      { id: 'google-maps', name: 'Google Maps', description: 'Search businesses on Google Maps', requiresApiKey: true },
      { id: 'reddit', name: 'Reddit', description: 'Search Reddit posts for buying intent', requiresApiKey: false },
      { id: 'linkedin', name: 'LinkedIn', description: 'Search LinkedIn companies', requiresApiKey: true },
      { id: 'twitter', name: 'X (Twitter)', description: 'Search Twitter posts', requiresApiKey: true },
      { id: 'facebook', name: 'Facebook', description: 'Search Facebook public pages', requiresApiKey: true },
      { id: 'product-hunt', name: 'Product Hunt', description: 'Find recently launched startups', requiresApiKey: true },
      { id: 'crunchbase', name: 'Crunchbase', description: 'Find funded startups', requiresApiKey: true },
      { id: 'wellfound', name: 'Wellfound', description: 'Find growing startups', requiresApiKey: true },
      { id: 'clutch', name: 'Clutch', description: 'Business directory', requiresApiKey: false },
      { id: 'goodfirms', name: 'GoodFirms', description: 'Software company directory', requiresApiKey: false },
    ];
  }
}