import { Global, Module } from '@nestjs/common'
import { ActivityService } from './activity.service.js'
import { ProposalAccessService } from './proposal-access.service.js'

@Global()
@Module({ providers: [ActivityService, ProposalAccessService], exports: [ActivityService, ProposalAccessService] })
export class CommonModule {}
