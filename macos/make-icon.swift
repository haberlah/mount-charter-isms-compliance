// Draws the Mount Charter app icon (shield-peak mark) and menu-bar glyph with
// Core Graphics, matching the 1024x1024 dark-slate squircle template shared
// with Home, Bench, Round Table, Shortlist, and Discog.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

func colour(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(
    colorSpace: sRGB,
    components: [
      CGFloat((hex >> 16) & 0xff) / 255,
      CGFloat((hex >> 8) & 0xff) / 255,
      CGFloat(hex & 0xff) / 255,
      alpha,
    ])!
}

func bitmap(_ pixels: Int, origin: CGPoint = .zero, side: CGFloat = 1024, draw: (CGContext, CGFloat) -> Void) -> CGImage {
  let ctx = CGContext(
    data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: sRGB,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .high
  ctx.setShouldAntialias(true)
  let scale = CGFloat(pixels) / side
  ctx.translateBy(x: 0, y: CGFloat(pixels))
  ctx.scaleBy(x: scale, y: -scale)
  ctx.translateBy(x: -origin.x, y: -origin.y)
  draw(ctx, scale)
  return ctx.makeImage()!
}

// Closed Shield Crest Mark: peaked heraldic compliance shield + centered verification seal dot
// Exact family geometry: 108 px uniform stroke + r = 54 dot (matching Home, Bench & Discog on 1024x1024 grid)
func markShieldPeak(_ ctx: CGContext, _ fill: CGColor) {
  ctx.saveGState()
  ctx.setStrokeColor(fill)
  ctx.setFillColor(fill)
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  ctx.setLineWidth(108)

  // Closed peaked compliance shield: M 512 292 L 708 362 V 508 Q 708 654 512 732 Q 316 654 316 508 V 362 Z
  let shield = CGMutablePath()
  shield.move(to: CGPoint(x: 512, y: 292))
  shield.addLine(to: CGPoint(x: 708, y: 362))
  shield.addLine(to: CGPoint(x: 708, y: 508))
  shield.addQuadCurve(to: CGPoint(x: 512, y: 732), control: CGPoint(x: 708, y: 654))
  shield.addQuadCurve(to: CGPoint(x: 316, y: 508), control: CGPoint(x: 316, y: 654))
  shield.addLine(to: CGPoint(x: 316, y: 362))
  shield.closeSubpath()
  ctx.addPath(shield)
  ctx.strokePath()

  // Central verification seal dot: (512, 512), r = 54 (diameter = 108 stroke width)
  ctx.fillEllipse(in: CGRect(x: 512 - 54, y: 512 - 54, width: 108, height: 108))
  ctx.restoreGState()
}

func appIcon(_ pixels: Int) -> CGImage {
  bitmap(pixels) { ctx, scale in
    let tile = CGPath(
      roundedRect: CGRect(x: 100, y: 100, width: 824, height: 824),
      cornerWidth: 185, cornerHeight: 185, transform: nil)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -10 * scale), blur: 20 * scale, color: colour(0x000000, 0.3))
    ctx.addPath(tile)
    ctx.setFillColor(colour(0x12161d))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(tile)
    ctx.clip()
    let body = CGGradient(
      colorsSpace: sRGB, colors: [colour(0x1b212a), colour(0x080b13)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(
      body, start: CGPoint(x: 100, y: 100), end: CGPoint(x: 924, y: 924),
      options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(
      CGPath(
        roundedRect: CGRect(x: 101.5, y: 101.5, width: 821, height: 821),
        cornerWidth: 183.5, cornerHeight: 183.5, transform: nil))
    ctx.setLineWidth(3)
    ctx.replacePathWithStrokedPath()
    ctx.clip()
    let edge = CGGradient(
      colorsSpace: sRGB,
      colors: [colour(0xffffff, 0.16), colour(0xffffff, 0.04), colour(0xffffff, 0.02)] as CFArray,
      locations: [0, 0.5, 1])!
    ctx.drawLinearGradient(edge, start: CGPoint(x: 0, y: 100), end: CGPoint(x: 0, y: 924), options: [])
    ctx.restoreGState()

    markShieldPeak(ctx, colour(0xffffff))
  }
}

func statusGlyph(_ pixels: Int) -> CGImage {
  bitmap(pixels, origin: CGPoint(x: 226, y: 226), side: 572) { ctx, _ in
    markShieldPeak(ctx, colour(0x000000))
  }
}

func pngData(_ image: CGImage) -> Data {
  let buffer = NSMutableData()
  let dest = CGImageDestinationCreateWithData(buffer, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("could not encode PNG") }
  return buffer as Data
}

func write(_ image: CGImage, _ path: String) {
  let url = URL(fileURLWithPath: path) as CFURL
  let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("could not write \(path)") }
}

func appendLE(_ data: inout Data, _ value: UInt16) {
  var le = value.littleEndian
  withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
}

func appendLE(_ data: inout Data, _ value: UInt32) {
  var le = value.littleEndian
  withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
}

func writeIco(_ images: [(Int, CGImage)], _ path: String) {
  let payloads = images.map { (size: $0.0, data: pngData($0.1)) }
  var ico = Data()
  appendLE(&ico, UInt16(0))
  appendLE(&ico, UInt16(1))
  appendLE(&ico, UInt16(payloads.count))
  var offset = UInt32(6 + 16 * payloads.count)
  for item in payloads {
    ico.append(UInt8(item.size >= 256 ? 0 : item.size))
    ico.append(UInt8(item.size >= 256 ? 0 : item.size))
    ico.append(0)
    ico.append(0)
    appendLE(&ico, UInt16(1))
    appendLE(&ico, UInt16(32))
    appendLE(&ico, UInt32(item.data.count))
    appendLE(&ico, offset)
    offset += UInt32(item.data.count)
  }
  for item in payloads {
    ico.append(item.data)
  }
  try! ico.write(to: URL(fileURLWithPath: path))
}

try FileManager.default.createDirectory(atPath: "\(out)/AppIcon.iconset", withIntermediateDirectories: true)
for (name, pixels) in [
  ("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
  ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256), ("icon_256x256@2x", 512),
  ("icon_512x512", 512), ("icon_512x512@2x", 1024),
] {
  write(appIcon(pixels), "\(out)/AppIcon.iconset/\(name).png")
}
write(appIcon(1024), "\(out)/AppIcon-1024.png")
write(appIcon(32), "\(out)/favicon-32.png")
write(appIcon(180), "\(out)/apple-touch-icon-180.png")
writeIco([(16, appIcon(16)), (32, appIcon(32))], "\(out)/favicon.ico")
for (name, pixels) in [("StatusGlyph", 18), ("StatusGlyph@2x", 36), ("StatusGlyph@3x", 54)] {
  write(statusGlyph(pixels), "\(out)/\(name).png")
}
