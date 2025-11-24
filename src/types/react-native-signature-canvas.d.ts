declare module 'react-native-signature-canvas' {
  import type { ViewStyle } from 'react-native';
  import type React from 'react';

  export interface SignatureViewRef {
    readSignature: () => void;
    clearSignature: () => void;
  }

  export interface SignatureCanvasProps {
    onOK?: (signature: string) => void;
    onEmpty?: () => void;
    onClear?: () => void;
    onEnd?: () => void;
    descriptionText?: string;
    clearText?: string;
    confirmText?: string;
    webStyle?: string;
    trimWhitespace?: boolean;
    autoClear?: boolean;
    backgroundColor?: string;
    imageType?: 'image/png' | 'image/jpeg' | 'image/svg+xml';
    style?: ViewStyle;
  }

  const SignatureComponent: React.ForwardRefExoticComponent<
    SignatureCanvasProps & React.RefAttributes<SignatureViewRef>
  >;

  export default SignatureComponent;
}


