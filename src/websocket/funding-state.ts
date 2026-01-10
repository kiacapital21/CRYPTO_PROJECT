// src/funding/funding-state.ts
import { Injectable } from '@nestjs/common';
import EventEmitter2 from 'eventemitter2';

@Injectable()
// src/websocket/funding-state.ts
export class FundingState {
  private resolvedAssets: Map<string, boolean> = new Map();
  constructor(private eventEmitter: EventEmitter2) {}

  // register(symbol: string, fundingTime: number, initialBalance: number) {
  //   this.fundingResolved.set(symbol, false);
  //   this.fundingAmounts.set(symbol, initialBalance);
  // }

  onAccountUpdate() {
    // if (!event?.a) return;

    // // Check balance updates (funding fees are applied here)
    // if (event.a.B) {
    //   for (const asset of event.a.B) {
    //     const balanceChange = parseFloat(asset.bc || '0');
    //     if (balanceChange !== 0) {
    //       console.log(`Funding fee detected for ${asset.a}: ${balanceChange}`);
    //       this.resolvedAssets.set(asset.a, true);

    // emit an event so other services can react
    this.eventEmitter.emit(
      'funding.fee',
      //   {
      //   asset: asset.a,
      //   change: balanceChange,
      // }
    );
    //   }
    // }
    // }

    // Optional: check position updates if needed
    // if (event.a.P) {
    //   for (const position of event.a.P) {
    //     const realizedPnl = parseFloat(position.cr || '0');
    //     if (realizedPnl !== 0) {
    //       console.log(
    //         `Position PnL update detected for ${position.s}: ${realizedPnl}`,
    //       );
    //     }
    //   }
    // }
  }

  /**
   * Check if funding has been resolved for a given asset
   */
  isResolved(asset: string) {
    return this.resolvedAssets.get(asset) || false;
  }

  /**
   * Clear the resolved state (after handling)
   */
  clear(asset?: string) {
    if (asset) {
      this.resolvedAssets.delete(asset);
    } else {
      this.resolvedAssets.clear();
    }
  }
}

// export class FundingState {
//   private readonly logger = new Logger(FundingState.name);

//   private activeFunding?: {
//     symbol: string;
//     fundingTime: number;
//     initialBalance: number;
//     resolved: boolean;
//   };

//   register(symbol: string, fundingTime: number, balance: number) {
//     console.log('register funding', symbol, fundingTime, balance);
//     this.activeFunding = {
//       symbol,
//       fundingTime,
//       initialBalance: balance,
//       resolved: false,
//     };
//   }

//   onAccountUpdate(event: any) {
//     console.log('on account update', JSON.stringify(event));
//     if (!this.activeFunding) return;
//     if (event.E < this.activeFunding.fundingTime) return;

//     const usdt = event.a?.B?.find((b) => b.a === 'USDT');
//     if (!usdt) return;

//     const current = Number(usdt.wb);

//     if (current !== this.activeFunding.initialBalance) {
//       this.logger.log('Funding balance change detected');
//       this.activeFunding.resolved = true;
//     }
//   }

//   isResolved(): boolean {
//     return !!this.activeFunding?.resolved;
//   }

//   clear() {
//     this.activeFunding = undefined;
//   }
// }
