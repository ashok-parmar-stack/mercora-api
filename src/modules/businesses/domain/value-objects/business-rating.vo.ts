export class BusinessRating {
  private readonly _score: number;
  private readonly _reviewCount: number;

  constructor(score: number, reviewCount: number) {
    if (score < 0 || score > 5) {
      throw new Error('Business rating score must be between 0.0 and 5.0');
    }
    if (reviewCount < 0) {
      throw new Error('Review count cannot be negative');
    }
    this._score = Math.round(score * 10) / 10;
    this._reviewCount = Math.floor(reviewCount);
  }

  get score(): number {
    return this._score;
  }

  get reviewCount(): number {
    return this._reviewCount;
  }

  isTopRated(): boolean {
    return this._score >= 4.5 && this._reviewCount >= 50;
  }
}
