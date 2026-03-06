import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface TruckIconProps {
  size: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}

const truckImage = require('@/assets/images/dump-truck.png');

export default function TruckIcon({ size, color, style }: TruckIconProps) {
  return (
    <Image
      source={truckImage}
      resizeMode="contain"
      style={[
        {
          width: size * 1.4,
          height: size,
        },
        color ? { tintColor: color } : undefined,
        style,
      ]}
    />
  );
}
