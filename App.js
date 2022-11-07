import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useInsertionEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal as ModalRN,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import MapView, {Marker} from 'react-native-maps';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Geolocation from 'react-native-geolocation-service';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import AntDesign from 'react-native-vector-icons/dist/AntDesign';

const PICKER_DATA = [
  {
    value: 'Área alagada',
    markerColor: 'orange',
  },
  {
    value: 'Buraco',
    markerColor: 'red',
  },
  {
    value: 'Chuvas fortes',
    markerColor: 'blue',
  },
  {
    value: 'Deslizamento',
    markerColor: 'green',
  },
];

const Picker = ({data = PICKER_DATA, onChange}) => {
  return (
    <View style={styles.picker}>
      {data.map((i, k) => {
        return (
          <View key={k}>
            <TouchableOpacity
              style={styles.pickerItemContent}
              onPress={() => onChange(i)}>
              <Text style={styles.pickerItemText}>{i.value}</Text>
            </TouchableOpacity>
            <Separator {...{data, index: k}} />
          </View>
        );
      })}
    </View>
  );
};

const Separator = ({data = [], index}) => {
  if (data.length - 1 === index) {
    return null;
  }
  return <View style={styles.separator} />;
};

const Modal = forwardRef((props, ref) => {
  const {bottom} = useSafeAreaInsets();

  const promise = useRef(null);
  const [isVisible, setVisible] = useState(false);

  useImperativeHandle(ref, () => {
    return {show};
  });

  const show = () =>
    new Promise((resolve, reject) => {
      setVisible(true);
      promise.current = {resolve, reject};
    });

  const handleAccept = item => {
    setVisible(false);
    promise.current.resolve(item);
  };

  const handleRequestClose = () => {
    setVisible(false);
    promise.current.resolve();
  };

  return (
    <ModalRN
      visible={isVisible}
      transparent
      onRequestClose={handleRequestClose}>
      <TouchableOpacity onPress={handleRequestClose} style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={null}>
          <View
            style={[
              styles.modalContent,
              {
                paddingBottom: bottom + 8,
              },
            ]}>
            <Text style={styles.modalTitle}>Qual o tipo de evento?</Text>
            <Picker onChange={handleAccept} />
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </ModalRN>
  );
});

const hasPermissionIOS = async () => {
  const openSetting = () => {
    Linking.openSettings().catch(() => {
      Alert.alert('Unable to open settings');
    });
  };
  const status = await Geolocation.requestAuthorization('whenInUse');

  if (status === 'granted') {
    return true;
  }

  if (status === 'denied') {
    Alert.alert('Location permission denied');
  }

  if (status === 'disabled') {
    Alert.alert(
      'Turn on Location Services to allow to determine your location.',
      '',
      [
        {text: 'Go to Settings', onPress: openSetting},
        {text: "Don't Use Location", onPress: () => {}},
      ],
    );
  }

  return false;
};

const hasLocationPermission = async () => {
  if (Platform.OS === 'ios') {
    const hasPermission = await hasPermissionIOS();
    return hasPermission;
  }

  if (Platform.OS === 'android' && Platform.Version < 23) {
    return true;
  }

  const hasPermission = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  if (hasPermission) {
    return true;
  }

  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  if (status === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }

  if (status === PermissionsAndroid.RESULTS.DENIED) {
    ToastAndroid.show('Location permission denied by user.', ToastAndroid.LONG);
  } else if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    ToastAndroid.show(
      'Location permission revoked by user.',
      ToastAndroid.LONG,
    );
  }

  return false;
};

const Subtitle = () => {
  const [isShow, setShow] = useState(false);

  const toggleLegend = () => setShow(state => !state);

  return (
    <TouchableOpacity
      onPress={toggleLegend}
      style={{
        position: 'absolute',
        zIndex: 2,
        bottom: 20,
        right: 16,
        padding: 8,
        borderRadius: isShow ? 8 : 999,
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}>
      {!isShow ? (
        <AntDesign name="question" size={24} color="white" />
      ) : (
        PICKER_DATA.map((i, k) => {
          return (
            <View key={k} style={{flexDirection: 'row', alignItems: 'center'}}>
              <View
                style={{
                  height: 8,
                  width: 8,
                  backgroundColor: i.markerColor,
                  borderRadius: 999,
                  marginRight: 4,
                }}
              />
              <Text style={{color: 'white', fontSize: 12.5}}>{i.value}</Text>
            </View>
          );
        })
      )}
    </TouchableOpacity>
  );
};

const App = () => {
  const modalRef = useRef(null);

  const [isLoading, setLoading] = useState(true);
  const [markers, setMarkers] = useState([]);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.015,
    longitudeDelta: 0.0121,
  });

  useInsertionEffect(() => {
    let subscriber;

    (async () => {
      try {
        await auth().signInAnonymously();

        await hasLocationPermission();

        if (hasLocationPermission) {
          Geolocation.getCurrentPosition(
            position => {
              const {latitude, longitude} = position.coords;
              setRegion({...region, latitude, longitude});
            },
            error => {
              console.log(error.code, error.message);
            },
            {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
          );
        }

        subscriber = firestore()
          .collection('events')
          .onSnapshot(querySnapshot => {
            const data = querySnapshot.docs.map(doc => {
              return {
                id: doc.id,
                ...doc.data(),
              };
            });

            setMarkers(data);
            setLoading(false);
          });
      } catch (error) {
        console.log('didMount', error);
      }
    })();

    return subscriber;
  }, []);

  const handleMapPress = async ({nativeEvent}) => {
    const response = await modalRef?.current?.show();

    if (response) {
      await firestore()
        .collection('events')
        .add({
          ...response,
          ...nativeEvent.coordinate,
        });
    }
  };

  const handleDeleteMarker = async i => {
    Alert.alert('Aviso', 'Deseja excluir o marcador?', [
      {
        text: 'Cancelar',
        onPress: () => {},
        style: 'cancel',
      },
      {
        text: 'Excluir',
        onPress: async () =>
          await firestore().collection('events').doc(i.id).delete(),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size={'large'} color={'rgba(0,0,0,0.4)'} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Modal ref={modalRef} />
      <Subtitle />
      <MapView
        style={styles.map}
        region={region}
        showsUserLocation
        onLongPress={handleMapPress}>
        {markers.map((i, k) => {
          return (
            <Marker
              key={k + i.markerColor}
              title={'Aviso'}
              description={i.value}
              pinColor={i.markerColor}
              onCalloutPress={() => handleDeleteMarker(i)}
              coordinate={{
                latitude: i.latitude,
                longitude: i.longitude,
              }}
            />
          );
        })}
      </MapView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
  },
  modalContent: {
    width: '90%',
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  modalTitle: {
    fontSize: 14.5,
    color: '#555',
  },
  picker: {
    paddingVertical: 4,
  },
  pickerItemContent: {
    paddingVertical: 8,
  },
  pickerItemText: {
    fontSize: 14.5,
    color: '#777',
  },
  separator: {
    borderWidth: 0.5,
    borderColor: '#777',
  },
  callout: {
    fontSize: 14,
  },
});

export default App;
