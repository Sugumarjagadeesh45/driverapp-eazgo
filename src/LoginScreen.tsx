import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
  StatusBar,
  Linking,
} from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/FontAwesome';
import { RootStackParamList } from '../App';

const { width, height } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Initialize Firebase with modular API
const auth = getAuth(getApp());

// Correct API URL for Android emulator
const getApiUrl = () => {
  if (__DEV__) {
    return Platform.OS === 'android' 
      ? 'http://10.0.2.2:5001/api/auth'  // Android emulator
      : 'http://localhost:5001/api/auth'; // iOS simulator
  }
  return 'https://dummy-bac.onrender.com/api/auth';
};

const API_URL = getApiUrl();

const LoginScreen = () => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendAvailable, setResendAvailable] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const navigation = useNavigation<NavigationProp>();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Start animations when component mounts
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const restoreVerification = async () => {
      try {
        const storedVerificationId = await AsyncStorage.getItem('verificationId');
        const storedPhone = await AsyncStorage.getItem('phoneNumber');

        if (storedVerificationId && storedPhone) {
          setVerificationId(storedVerificationId);
          setMobileNumber(storedPhone);
          setOtpSent(true);

          Alert.alert(
            'Session Restored',
            `Please enter OTP sent to ${storedPhone}`
          );
        }
      } catch (error) {
        console.log('Restore session error:', error);
      }
    };

    restoreVerification();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      setResendAvailable(false);
      timer = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            setResendAvailable(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const isValidPhoneNumber = useCallback((phone: string) => /^[6-9]\d{9}$/.test(phone), []);

  // STEP 1: Check if driver exists and send Firebase OTP
  const sendOTP = useCallback(async (phone: string) => {
    if (!phone) {
      Alert.alert('Error', 'Please enter your mobile number.');
      return;
    }
    
    if (!isValidPhoneNumber(phone)) {
      Alert.alert('Error', 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    
    try {
      setLoading(true);
      console.log(`📞 Checking driver: ${phone}`);
      console.log(`🌐 API URL: ${API_URL}`);
      
      // STEP 1A: Check if driver exists in MongoDB
      try {
        const checkResponse = await axios.post(
          `${API_URL}/request-driver-otp`, 
          { phoneNumber: phone },
          { 
            timeout: 8000, // Increased timeout
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );
        
        console.log('📋 Driver check response:', checkResponse.data);
        
        if (checkResponse.data.success) {
          console.log(`✅ Driver found: ${checkResponse.data.driverId}`);
        } else {
          // Driver not found - show professional alert
          Alert.alert(
            'Authentication Failed',
            'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
            [
              { 
                text: 'Contact Admin', 
                onPress: () => Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue')
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
          return;
        }
      } catch (error: any) {
        console.log('⚠️ Backend check error:', error.message);
        
        if (error.response?.status === 404) {
          // Driver not found - show professional alert
          Alert.alert(
            'Authentication Failed',
            'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
            [
              { 
                text: 'Contact Admin', 
                onPress: () => Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue')
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
          return;
        }
        
        // If backend is down, we'll still try Firebase but warn user
        Alert.alert(
          'Network Warning',
          'Cannot reach our servers. Will try to send OTP via Firebase.',
          [{ text: 'Continue' }]
        );
        console.log('⚠️ Backend unavailable, proceeding with Firebase...');
      }
      
      // STEP 1B: Send Firebase OTP using modular API
      try {
        console.log(`🔥 Sending Firebase OTP to: +91${phone}`);
        
        const formattedPhone = `+91${phone}`;
        
        // Send OTP using modular Firebase API
        const confirmation = await signInWithPhoneNumber(auth, formattedPhone);
        
        setVerificationId(confirmation.verificationId);
        await AsyncStorage.setItem('verificationId', confirmation.verificationId);
        await AsyncStorage.setItem('phoneNumber', phone);
        
        // Show success alert
        Alert.alert(
          'OTP Sent',
          `OTP has been sent to ${phone}. Please check your messages.`,
          [{ text: 'OK' }]
        );
        
        setOtpSent(true);
        setResendCountdown(30);
        
      } catch (firebaseError: any) {
        console.error('❌ Firebase OTP error:', firebaseError);
        
        if (firebaseError.code === 'auth/invalid-phone-number') {
          Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
        } else if (firebaseError.code === 'auth/too-many-requests') {
          Alert.alert('Too Many Attempts', 'Please try again later.');
        } else if (firebaseError.code === 'auth/quota-exceeded') {
          Alert.alert('Quota Exceeded', 'SMS quota exceeded. Please try again later.');
        } else if (firebaseError.code === 'auth/captcha-check-failed') {
          Alert.alert('Captcha Failed', 'Please try again.');
        } else {
          Alert.alert('Error', firebaseError.message || 'Failed to send OTP. Please try again.');
        }
      }
      
    } catch (error: any) {
      console.error('❌ General error in sendOTP:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isValidPhoneNumber]);

  // STEP 2: Verify Firebase OTP and get driver data
  const verifyOTP = useCallback(async () => {
    console.log('🔍 verifyOTP called with:', { 
      code, 
      verificationId: verificationId ? 'exists' : 'null',
      mobileNumber 
    });
    
    if (!code) {
      Alert.alert('Error', 'Please enter OTP.');
      return;
    }

    if (!verificationId) {
      Alert.alert('Error', 'No OTP session found. Please request a new OTP.');
      return;
    }

    try {
      setLoading(true);
      console.log(`🔐 Verifying OTP: ${code}`);

      // STEP 2A: Verify with Firebase ONLY using modular API
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const userCredential = await signInWithCredential(auth, credential);
      
      console.log('✅ Firebase verification successful:', userCredential.user.uid);

      // STEP 2B: Get driver info from backend
      console.log(`📞 Getting driver info for: ${mobileNumber}`);
      console.log(`🌐 API URL: ${API_URL}`);
      
      try {
        const response = await axios.post(
          `${API_URL}/get-driver-info`,
          { phoneNumber: mobileNumber },
          { 
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('📋 Driver info response:', response.data);

        if (response.data.success) {
          const driverInfo = response.data.driver;
          
          // Save everything to AsyncStorage
          await AsyncStorage.multiSet([
            ['authToken', response.data.token],
            ['driverInfo', JSON.stringify(driverInfo)],
            ['phoneNumber', mobileNumber],
            ['firebaseUid', userCredential.user.uid],
            // Store individual fields for backward compatibility
            ['driverId', driverInfo.driverId || ''],
            ['driverName', driverInfo.name || ''],
            ['vehicleType', driverInfo.vehicleType || 'taxi'],
            ['vehicleNumber', driverInfo.vehicleNumber || 'N/A'],
          ]);

          // Clear verification session
          await AsyncStorage.removeItem('verificationId');

          console.log('✅ Driver authenticated successfully');

          // Navigate to Screen1 with driverInfo as param
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'Screen1',
                params: {
                  driverInfo: driverInfo,
                },
              },
            ],
          });
        } else {
          throw new Error(response.data.message || 'Driver data not found after Firebase auth');
        }
        
      } catch (backendError: any) {
        console.error('❌ Backend error after Firebase auth:', backendError);
        
        // Even if backend fails, we can proceed with minimal data
        const minimalDriver = {
          driverId: 'temp-' + mobileNumber,
          name: 'Driver',
          phone: mobileNumber,
          vehicleType: 'Unknown',
          vehicleNumber: 'N/A',
          status: 'Live',
          wallet: 0
        };
        
        await AsyncStorage.multiSet([
          ['authToken', 'firebase-temp-token-' + Date.now()],
          ['driverInfo', JSON.stringify(minimalDriver)],
          ['phoneNumber', mobileNumber],
          ['firebaseUid', userCredential.user.uid],
          ['driverId', minimalDriver.driverId],
          ['driverName', minimalDriver.name],
          ['vehicleType', minimalDriver.vehicleType],
          ['vehicleNumber', minimalDriver.vehicleNumber],
        ]);

        await AsyncStorage.removeItem('verificationId');

        Alert.alert(
          'Logged In',
          'Logged in with Firebase authentication.',
          [
            {
              text: 'Continue',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Screen1',
                      params: { driverInfo: minimalDriver },
                    },
                  ],
                });
              }
            }
          ]
        );
      }
      
    } catch (error: any) {
      console.error('❌ OTP verification error:', error);
      
      if (error.code === 'auth/invalid-verification-code') {
        Alert.alert('Invalid OTP', 'The OTP you entered is incorrect. Please try again.');
      } else if (error.code === 'auth/code-expired') {
        Alert.alert('OTP Expired', 'The OTP has expired. Please request a new one.');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert('Too Many Attempts', 'Please try again later.');
      } else {
        Alert.alert('Verification Failed', error.message || 'Failed to verify OTP.');
      }
      
      // Clear OTP field on error
      setCode('');
    } finally {
      setLoading(false);
    }
  }, [code, mobileNumber, navigation, verificationId]);

  return (
    <LinearGradient
      colors={['#4facfe', '#00f2fe']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <Animated.View 
          style={[
            styles.contentContainer, 
            { 
              opacity: fadeAnim, 
              transform: [{ translateY: slideAnim }] 
            } 
          ]}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Icon name="taxi" size={80} color="#fff" />
              <Text style={styles.appName}>EazyGo Driver</Text>
            </View>
          </View>
          
          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>Login to your driver account</Text>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Icon name="phone" size={20} color="#4facfe" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Mobile Number"
                  placeholderTextColor="#999"
                  value={mobileNumber}
                  onChangeText={(text) => setMobileNumber(text.replace(/[^0-9]/g, ''))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!loading}
                />
              </View>
              
              {otpSent && (
                <View style={styles.inputWrapper}>
                  <Icon name="lock" size={20} color="#4facfe" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter OTP"
                    placeholderTextColor="#999"
                    value={code}
                    onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>
              )}
            </View>
            
            <View style={styles.buttonContainer}>
              {otpSent ? (
                <>
                  <TouchableOpacity 
                    style={[styles.button, loading && styles.buttonDisabled]} 
                    onPress={verifyOTP} 
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.buttonText}>Verify OTP</Text>
                    )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={() => sendOTP(mobileNumber)}
                    disabled={loading || !resendAvailable}
                  >
                    <Text style={[
                      styles.resendText, 
                      !resendAvailable && styles.resendDisabledText
                    ]}>
                      {resendAvailable ? 'Resend OTP' : `Resend in ${resendCountdown}s`}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity 
                  style={[styles.button, loading && styles.buttonDisabled]} 
                  onPress={() => sendOTP(mobileNumber)} 
                  disabled={loading}
                >
                  {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.buttonText}>Send OTP</Text>
                    )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    width: width * 0.9,
    maxWidth: 400,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    marginBottom: 15,
    paddingHorizontal: 15,
    height: 55,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    marginTop: 10,
  },
  button: {
    backgroundColor: '#4facfe',
    borderRadius: 15,
    height: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#a0a0a0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  resendText: {
    color: '#4facfe',
    fontSize: 16,
  },
  resendDisabledText: {
    color: '#a0a0a0',
  },
});

export default LoginScreen;














// // src/LoginScreen.tsx
// import React, { useState } from "react";
// import {
//   View,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   StyleSheet,
//   ActivityIndicator,
//   Alert,
//   PermissionsAndroid,
//   Platform,
//   Linking,
// } from "react-native";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import Geolocation from "@react-native-community/geolocation";
// import api from "../utils/api"; // Axios instance pointing to your backend

// interface LoginScreenProps {
//   navigation: any;
// }

// // ---------------- Type for coordinates ----------------
// interface Coordinates {
//   latitude: number;
//   longitude: number;
// }

// const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
//   const [driverId, setDriverId] = useState("");
//   const [password, setPassword] = useState("");
//   const [loading, setLoading] = useState(false);
  
//   // Console log for component initialization
//   console.log("🔑 LoginScreen component initialized");

//   // ---------------- Request location permission ----------------
//   const requestLocationPermission = async (): Promise<boolean> => {
//     console.log("🔐 Requesting location permission...");
    
//     if (Platform.OS === "android") {
//       const granted = await PermissionsAndroid.request(
//         PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
//         {
//           title: "Location Permission",
//           message: "We need your location to login",
//           buttonNeutral: "Ask Me Later",
//           buttonNegative: "Cancel",
//           buttonPositive: "OK",
//         }
//       );
      
//       console.log("📱 Android permission result:", granted);
//       return granted === PermissionsAndroid.RESULTS.GRANTED;
//     }
    
//     console.log("📱 iOS - permission assumed granted");
//     return true;
//   };

//   // ---------------- Prompt user to enable High Accuracy ----------------
//   const promptEnableHighAccuracy = () => {
//     console.log("⚠️ Prompting user to enable high accuracy GPS");
//     Alert.alert(
//       "⚠️ Enable High Accuracy",
//       "Your GPS is not in High Accuracy mode. Please enable it for proper login.",
//       [
//         { text: "Cancel", style: "cancel" },
//         {
//           text: "Open Settings",
//           onPress: () => {
//             console.log("📱 Opening device settings");
//             Linking.openSettings();
//           },
//         },
//       ]
//     );
//   };

//   // ---------------- Get current location with retry ----------------
//   const getLocation = async (retries = 2): Promise<Coordinates> => {
//     console.log(`📍 Getting location (attempt ${retries + 1})...`);
    
//     for (let i = 0; i <= retries; i++) {
//       try {
//         console.log(`🔄 Location attempt ${i + 1}...`);
//         const coords = await new Promise<Coordinates>((resolve, reject) => {
//           Geolocation.getCurrentPosition(
//             (pos) => {
//               console.log("✅ Position obtained:", {
//                 latitude: pos.coords.latitude,
//                 longitude: pos.coords.longitude,
//                 accuracy: pos.coords.accuracy
//               });
//               resolve(pos.coords);
//             },
//             (err) => {
//               console.error("❌ Geolocation error:", {
//                 code: err.code,
//                 message: err.message
//               });
              
//               if (err.code === 2) promptEnableHighAccuracy();
//               reject(err);
//             },
//             { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 }
//           );
//         });
//         return coords; // success
//       } catch (err) {
//         console.error(`❌ Location attempt ${i + 1} failed:`, err.message);
//         if (i === retries) throw err; // last attempt, throw error
//       }
//     }
//     throw new Error("Unable to get location");
//   };

//   // ---------------- Handle Login ----------------
//   const handleLogin = async () => {
//     console.log("🚀 Login process started");
    
//     if (!driverId || !password) {
//       console.log("⚠️ Missing credentials:", {
//         hasDriverId: !!driverId,
//         hasPassword: !!password
//       });
//       Alert.alert("⚠️ Input Error", "Please enter driver ID and password");
//       return;
//     }
    
//     setLoading(true);
    
//     // Console log for driver ID input
//     console.log("📝 Driver ID Input:", driverId);
    
//     const hasPermission = await requestLocationPermission();
//     if (!hasPermission) {
//       setLoading(false);
//       console.log("❌ Location permission denied");
//       Alert.alert("⚠️ Permission Denied", "Location is required to login.");
//       return;
//     }
    
//     try {
//       console.log("📍 Getting current location...");
//       const { latitude, longitude } = await getLocation();
//       console.log("✅ Location obtained:", { latitude, longitude });
      
//       console.log("🌐 Sending login request to server...");
//       console.log("Login with driver ID:", driverId);
      
//       const res = await api.post("/drivers/login", {
//         driverId,
//         password,
//         latitude,
//         longitude,
//       });
      
//       console.log("📡 Login response received:", {
//         status: res.status,
//         data: res.data
//       });
      
//       if (res.status === 200) {
//         const driver = res.data.driver;
//         console.log("✅ Login successful, driver data:", driver);
        
//         // Store auth info
//         console.log("💾 Storing authentication data...");
//         await AsyncStorage.multiSet([
//           ["isRegistered", "true"],
//           ["driverId", driver.driverId],
//           ["driverName", driver.name],
//           ["authToken", res.data.token],
//         ]);
        
//         console.log("✅ Authentication data stored in AsyncStorage");
        
//         // Navigate to Screen1 with driver information
//         console.log("🧭 Navigating to Screen1...");
//         navigation.replace("Screen1", {
//           driverId: driver.driverId,
//           driverName: driver.name,
//           latitude,
//           longitude,
//         });
        
//         console.log("✅ Login process completed successfully");
//       } else {
//         console.error("❌ Login failed with status:", res.status);
//         Alert.alert("❌ Login Failed", res.data.msg || "Invalid credentials");
//       }
//     } catch (err: any) {
//       console.error("❌ Location/Login Error:", err);
      
//       if (err.code === 1) {
//         // PERMISSION_DENIED
//         console.error("❌ Location permission denied");
//         Alert.alert("❌ Permission Denied", "Location permission is required.");
//       } else if (err.code === 2) {
//         // POSITION_UNAVAILABLE
//         console.error("❌ GPS position unavailable");
//         promptEnableHighAccuracy();
//       } else if (err.code === 3) {
//         // TIMEOUT
//         console.error("❌ GPS timeout");
//         Alert.alert(
//           "❌ GPS Timeout",
//           "Could not get location. Make sure GPS is enabled and try again."
//         );
//       } else if (err.response) {
//         // API error
//         console.error("❌ API error response:", err.response.data);
//         Alert.alert("❌ Login Failed", err.response.data.msg || "Invalid credentials");
//       } else {
//         console.error("❌ Unknown error:", err.message);
//         Alert.alert(
//           "❌ GPS/Login Error",
//           "Cannot get location. Please enable GPS High Accuracy and try again."
//         );
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Driver Login</Text>
//       <TextInput
//         style={styles.input}
//         placeholder="Driver ID"
//         value={driverId}
//         onChangeText={(text) => {
//           console.log("📝 Driver ID input changed:", text);
//           setDriverId(text);
//         }}
//         autoCapitalize="none"
//       />
//       <TextInput
//         style={styles.input}
//         placeholder="Password"
//         value={password}
//         onChangeText={(text) => {
//           console.log("🔑 Password input changed");
//           setPassword(text);
//         }}
//         secureTextEntry
//       />
//       <TouchableOpacity
//         style={styles.button}
//         onPress={handleLogin}
//         disabled={loading}
//       >
//         {loading ? (
//           <ActivityIndicator color="#fff" />
//         ) : (
//           <Text style={styles.buttonText}>Login</Text>
//         )}
//       </TouchableOpacity>
//     </View>
//   );
// };

// export default LoginScreen;

// // ---------------- Styles ----------------
// const styles = StyleSheet.create({
//   container: { 
//     flex: 1, 
//     justifyContent: "center", 
//     alignItems: "center", 
//     padding: 20, 
//     backgroundColor: "#f5f5f5" 
//   },
//   title: { 
//     fontSize: 28, 
//     fontWeight: "bold", 
//     marginBottom: 30 
//   },
//   input: { 
//     width: "100%", 
//     padding: 12, 
//     marginBottom: 15, 
//     borderWidth: 1, 
//     borderColor: "#ccc", 
//     borderRadius: 8, 
//     backgroundColor: "#fff" 
//   },
//   button: { 
//     width: "100%", 
//     padding: 15, 
//     backgroundColor: "#28a745", 
//     borderRadius: 8, 
//     alignItems: "center" 
//   },
//   buttonText: { 
//     color: "#fff", 
//     fontWeight: "bold", 
//     fontSize: 16 
//   },
// });