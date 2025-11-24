import { JwtStrategyGuard } from './jwt-strategy.guard';

describe('JwtStrategyGuard', () => {
  it('should be defined', () => {
    expect(new JwtStrategyGuard()).toBeDefined();
  });
});
