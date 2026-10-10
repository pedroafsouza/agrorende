/** Metro resolves bundled images to a numeric asset id. */
declare module "*.png" {
  const asset: number;
  export default asset;
}
